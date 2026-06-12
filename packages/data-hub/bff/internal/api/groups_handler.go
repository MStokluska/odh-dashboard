package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/julienschmidt/httprouter"
)

const (
	GroupsPath = ApiPathPrefix + "/groups"
	GroupPath  = ApiPathPrefix + "/groups/:name"
)

type OCPGroup struct {
	APIVersion string   `json:"apiVersion"`
	Kind       string   `json:"kind"`
	Metadata   Metadata `json:"metadata"`
	Users      []string `json:"users"`
}

type Metadata struct {
	Name string `json:"name"`
}

type CreateGroupRequest struct {
	Name  string   `json:"name"`
	Users []string `json:"users"`
}

func (app *App) ListGroupsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups", getK8sAPIURL())
	req, err := ucRequest(r, http.MethodGet, k8sURL, nil)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	resp, err := newUCClient().Do(req)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var groupList struct {
		Items []OCPGroup `json:"items"`
	}
	json.Unmarshal(body, &groupList)

	filtered := []OCPGroup{}
	for _, g := range groupList.Items {
		if len(g.Metadata.Name) > 3 && g.Metadata.Name[:3] == "uc-" {
			filtered = append(filtered, g)
		}
	}

	result, _ := json.Marshal(map[string]any{"groups": filtered})
	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

func (app *App) CreateGroupHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var req CreateGroupRequest
	body, _ := io.ReadAll(r.Body)
	if err := json.Unmarshal(body, &req); err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("invalid request body: %w", err))
		return
	}

	groupName := "uc-" + req.Name
	client := newUCClient()

	// 1. Create OCP Group
	group := OCPGroup{
		APIVersion: "user.openshift.io/v1",
		Kind:       "Group",
		Metadata:   Metadata{Name: groupName},
		Users:      req.Users,
	}
	groupJSON, _ := json.Marshal(group)
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups", getK8sAPIURL())

	k8sReq, err := ucRequest(r, http.MethodPost, k8sURL, io.NopCloser(jsonReader(groupJSON)))
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	groupResp, err := client.Do(k8sReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	groupResp.Body.Close()

	// 2. Create UC catalog matching group name
	catalogBody := fmt.Sprintf(`{"name":"%s","comment":"Catalog for group %s"}`, req.Name, groupName)
	catalogURL := fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs", getUCDirectURL())
	catReq, _ := ucAdminRequest(r, http.MethodPost, catalogURL, stringReader(catalogBody))
	catResp, err := client.Do(catReq)
	if err != nil {
		app.logger.Error("Failed to create UC catalog", "error", err, "catalog", req.Name)
	} else {
		catBody, _ := io.ReadAll(catResp.Body)
		app.logger.Info("UC catalog creation response", "status", catResp.StatusCode, "body", string(catBody), "catalog", req.Name)
		catResp.Body.Close()
	}

	// 3. Create SCIM users for each member + grant USE CATALOG
	for _, user := range req.Users {
		scimBody := fmt.Sprintf(`{"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],"userName":"%s","displayName":"%s","active":true,"emails":[{"value":"%s","primary":true}]}`, user, user, user)
		scimURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())
		scimReq, _ := ucAdminRequest(r, http.MethodPost, scimURL, stringReader(scimBody))
		scimResp, err := client.Do(scimReq)
		if err != nil {
			app.logger.Error("SCIM user creation failed", "error", err, "user", user)
		} else {
			scimRespBody, _ := io.ReadAll(scimResp.Body)
			app.logger.Info("SCIM user response", "status", scimResp.StatusCode, "body", string(scimRespBody), "user", user)
			scimResp.Body.Close()
		}

		// Grant USE CATALOG
		grantBody := fmt.Sprintf(`{"changes":[{"principal":"%s","add":["USE CATALOG"]}]}`, user)
		grantURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/catalog/%s", getUCDirectURL(), req.Name)
		app.logger.Info("Granting USE CATALOG", "url", grantURL, "user", user, "catalog", req.Name)
		grantReq, grantErr := ucAdminRequest(r, http.MethodPatch, grantURL, stringReader(grantBody))
		if grantErr != nil {
			app.logger.Error("Failed to create grant request", "error", grantErr)
			continue
		}
		grantResp, err := client.Do(grantReq)
		if err != nil {
			app.logger.Error("Grant request failed", "error", err, "user", user)
		} else {
			grantRespBody, _ := io.ReadAll(grantResp.Body)
			app.logger.Info("Grant response", "status", grantResp.StatusCode, "body", string(grantRespBody), "user", user)
			grantResp.Body.Close()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","group":"%s","catalog":"%s","members":%d}`, groupName, req.Name, len(req.Users))
}

func stringReader(s string) io.Reader {
	return io.NopCloser(bytesReader([]byte(s)))
}

func jsonReader(data []byte) io.Reader {
	return io.NopCloser(bytesReader(data))
}

type bytesReaderStruct struct {
	data []byte
	pos  int
}

func bytesReader(data []byte) *bytesReaderStruct {
	return &bytesReaderStruct{data: data}
}

func (br *bytesReaderStruct) Read(p []byte) (n int, err error) {
	if br.pos >= len(br.data) {
		return 0, io.EOF
	}
	n = copy(p, br.data[br.pos:])
	br.pos += n
	return n, nil
}

func (app *App) DeleteGroupHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	client := newUCClient()

	// 1. Delete OCP Group
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), name)
	k8sReq, _ := ucRequest(r, http.MethodDelete, k8sURL, nil)
	k8sResp, err := client.Do(k8sReq)
	if err == nil {
		k8sResp.Body.Close()
	}

	// 2. Delete UC catalog (name without uc- prefix)
	catalogName := name
	if len(name) > 3 && name[:3] == "uc-" {
		catalogName = name[3:]
	}
	catURL := fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs/%s?force=true", getUCDirectURL(), catalogName)
	catReq, _ := ucAdminRequest(r, http.MethodDelete, catURL, nil)
	catResp, err := client.Do(catReq)
	if err == nil {
		catResp.Body.Close()
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","deleted":"%s"}`, name)
}

func (app *App) ListOCPUsersHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/users", getK8sAPIURL())
	req, err := ucRequest(r, http.MethodGet, k8sURL, nil)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	client := newUCClient()
	resp, err := client.Do(req)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var userList struct {
		Items []struct {
			Metadata struct {
				Name string `json:"name"`
			} `json:"metadata"`
		} `json:"items"`
	}
	json.Unmarshal(body, &userList)

	users := []string{}
	for _, u := range userList.Items {
		if u.Metadata.Name != "" {
			users = append(users, u.Metadata.Name)
		}
	}

	result, _ := json.Marshal(map[string]any{"users": users})
	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}
