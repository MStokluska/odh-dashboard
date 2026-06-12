package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

const (
	PermGroupsPath = ApiPathPrefix + "/perm-groups"
	PermGroupPath  = ApiPathPrefix + "/perm-groups/:name"
	permGroupPfx   = "ucg-"
)

func (app *App) ListPermGroupsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
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
		if strings.HasPrefix(g.Metadata.Name, permGroupPfx) {
			filtered = append(filtered, g)
		}
	}

	result, _ := json.Marshal(map[string]any{"groups": filtered})
	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

func (app *App) CreatePermGroupHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var req CreateGroupRequest
	body, _ := io.ReadAll(r.Body)
	if err := json.Unmarshal(body, &req); err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("invalid request body: %w", err))
		return
	}

	groupName := permGroupPfx + req.Name

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

	k8sResp, err := newUCClient().Do(k8sReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	k8sResp.Body.Close()

	if k8sResp.StatusCode >= 400 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(k8sResp.StatusCode)
		fmt.Fprintf(w, `{"error":"failed to create group","status":%d}`, k8sResp.StatusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","group":"%s","members":%d}`, groupName, len(req.Users))
}

func (app *App) DeletePermGroupHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), name)
	k8sReq, _ := ucRequest(r, http.MethodDelete, k8sURL, nil)
	k8sResp, err := newUCClient().Do(k8sReq)
	if err == nil {
		k8sResp.Body.Close()
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","deleted":"%s"}`, name)
}

func (app *App) PatchPermGroupHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	client := newUCClient()

	var req struct {
		AddUsers    []string `json:"addUsers"`
		RemoveUsers []string `json:"removeUsers"`
	}
	body, _ := io.ReadAll(r.Body)
	json.Unmarshal(body, &req)

	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), name)
	getReq, _ := ucRequest(r, http.MethodGet, k8sURL, nil)
	getResp, err := client.Do(getReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	getBody, _ := io.ReadAll(getResp.Body)
	getResp.Body.Close()

	var group map[string]interface{}
	json.Unmarshal(getBody, &group)

	usersRaw, _ := group["users"].([]interface{})
	userSet := make(map[string]bool)
	for _, u := range usersRaw {
		userSet[u.(string)] = true
	}
	for _, u := range req.AddUsers {
		userSet[u] = true
	}
	for _, u := range req.RemoveUsers {
		delete(userSet, u)
	}

	users := []string{}
	for u := range userSet {
		users = append(users, u)
	}
	group["users"] = users

	putBody, _ := json.Marshal(group)
	putReq, _ := ucRequest(r, http.MethodPut, k8sURL, stringReader(string(putBody)))
	putResp, err := client.Do(putReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	putResp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","group":"%s","members":%d}`, name, len(users))
}

func getGroupMembers(r *http.Request, groupName string) ([]string, error) {
	k8sURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), groupName)
	req, err := ucRequest(r, http.MethodGet, k8sURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := newUCClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var group struct {
		Users []string `json:"users"`
	}
	json.Unmarshal(body, &group)
	return group.Users, nil
}
