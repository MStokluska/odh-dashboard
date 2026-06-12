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
	PermissionsProxyPath = ApiPathPrefix + "/permissions/:type/*fullName"
	PropagateSchemaPath  = ApiPathPrefix + "/permissions/propagate-schema"
)

var validResourceTypes = map[string]bool{
	"catalog": true,
	"schema":  true,
	"volume":  true,
	"table":   true,
}

type privilegeAssignment struct {
	Principal  string   `json:"principal"`
	Privileges []string `json:"privileges"`
}

type permissionsResponse struct {
	PrivilegeAssignments []privilegeAssignment `json:"privilege_assignments"`
}

type permChange struct {
	Principal string   `json:"principal"`
	Type      string   `json:"type"`
	Add       []string `json:"add,omitempty"`
	Remove    []string `json:"remove,omitempty"`
}

type patchRequest struct {
	Changes []permChange `json:"changes"`
}

func (app *App) GetPermissionsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	resType := ps.ByName("type")
	fullName := strings.TrimPrefix(ps.ByName("fullName"), "/")

	if !validResourceTypes[resType] || fullName == "" {
		app.badRequestResponse(w, r, fmt.Errorf("invalid resource type or name"))
		return
	}

	client := newUCClient()
	token := getUCAdminToken()

	scimURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())
	scimReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, scimURL, nil)
	scimReq.Header.Set("Authorization", "Bearer "+token)
	scimReq.Header.Set("Cookie", "UC_TOKEN="+token)
	scimResp, err := client.Do(scimReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	defer scimResp.Body.Close()
	scimBody, _ := io.ReadAll(scimResp.Body)

	var scimResult struct {
		Resources []struct {
			UserName string `json:"userName"`
		} `json:"Resources"`
	}
	json.Unmarshal(scimBody, &scimResult)

	parts := strings.Split(fullName, ".")
	var listURL string
	var nameField string
	switch resType {
	case "catalog":
		listURL = fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs", getUCDirectURL())
		nameField = "catalogs"
	case "schema":
		if len(parts) < 1 {
			app.badRequestResponse(w, r, fmt.Errorf("invalid schema name"))
			return
		}
		listURL = fmt.Sprintf("%s/api/2.1/unity-catalog/schemas?catalog_name=%s", getUCDirectURL(), parts[0])
		nameField = "schemas"
	case "volume":
		if len(parts) < 2 {
			app.badRequestResponse(w, r, fmt.Errorf("invalid volume name"))
			return
		}
		listURL = fmt.Sprintf("%s/api/2.1/unity-catalog/volumes?catalog_name=%s&schema_name=%s", getUCDirectURL(), parts[0], parts[1])
		nameField = "volumes"
	case "table":
		if len(parts) < 2 {
			app.badRequestResponse(w, r, fmt.Errorf("invalid table name"))
			return
		}
		listURL = fmt.Sprintf("%s/api/2.1/unity-catalog/tables?catalog_name=%s&schema_name=%s", getUCDirectURL(), parts[0], parts[1])
		nameField = "tables"
	}

	targetName := parts[len(parts)-1]

	var assignments []privilegeAssignment
	for _, user := range scimResult.Resources {
		if user.UserName == "admin" {
			continue
		}
		probe, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, listURL, nil)
		probe.Header.Set("Authorization", "Bearer "+token)
		probe.Header.Set("Cookie", "UC_TOKEN="+token)
		probe.Header.Set("X-Auth-Request-User", user.UserName)

		probeResp, pErr := client.Do(probe)
		if pErr != nil {
			continue
		}
		probeBody, _ := io.ReadAll(probeResp.Body)
		probeResp.Body.Close()

		var listResult map[string]json.RawMessage
		json.Unmarshal(probeBody, &listResult)

		raw, ok := listResult[nameField]
		if !ok {
			continue
		}

		var items []struct {
			Name string `json:"name"`
		}
		json.Unmarshal(raw, &items)

		hasAccess := false
		for _, item := range items {
			if item.Name == targetName {
				hasAccess = true
				break
			}
		}

		if hasAccess {
			privs := inferPrivileges(resType)
			assignments = append(assignments, privilegeAssignment{
				Principal:  user.UserName,
				Privileges: privs,
			})
		}
	}

	if assignments == nil {
		assignments = []privilegeAssignment{}
	}

	resp := permissionsResponse{PrivilegeAssignments: assignments}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func inferPrivileges(resType string) []string {
	switch resType {
	case "catalog":
		return []string{"USE CATALOG"}
	case "schema":
		return []string{"USE SCHEMA"}
	case "volume":
		return []string{"READ VOLUME"}
	case "table":
		return []string{"SELECT"}
	}
	return []string{}
}

func (app *App) PatchPermissionsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	resType := ps.ByName("type")
	fullName := strings.TrimPrefix(ps.ByName("fullName"), "/")

	if !validResourceTypes[resType] || fullName == "" {
		app.badRequestResponse(w, r, fmt.Errorf("invalid resource type or name"))
		return
	}

	body, _ := io.ReadAll(r.Body)
	var req patchRequest
	json.Unmarshal(body, &req)

	client := newUCClient()
	token := getUCAdminToken()

	for _, change := range req.Changes {
		users, err := resolvePrincipal(r, change.Principal, change.Type)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}

		for _, user := range users {
			ensureSCIMUser(client, token, user)
			ucChange := map[string]interface{}{"principal": user}
			if len(change.Add) > 0 {
				ucChange["add"] = change.Add
			}
			if len(change.Remove) > 0 {
				ucChange["remove"] = change.Remove
			}

			ucBody, _ := json.Marshal(map[string]interface{}{
				"changes": []interface{}{ucChange},
			})

			ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/%s/%s", getUCDirectURL(), resType, fullName)
			ucReq, _ := http.NewRequest(http.MethodPatch, ucURL, stringReader(string(ucBody)))
			ucReq.Header.Set("Authorization", "Bearer "+token)
			ucReq.Header.Set("Cookie", "UC_TOKEN="+token)
			ucReq.Header.Set("Content-Type", "application/json")

			resp, err := client.Do(ucReq)
			if err != nil {
				continue
			}
			resp.Body.Close()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok"}`)
}

func resolvePrincipal(r *http.Request, principal, principalType string) ([]string, error) {
	if principalType == "group" {
		return getGroupMembers(r, principal)
	}
	return []string{principal}, nil
}

func ensureSCIMUser(client *http.Client, token, userName string) {
	scimBody := fmt.Sprintf(
		`{"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],"userName":"%s","displayName":"%s","active":true,"emails":[{"value":"%s","primary":true}]}`,
		userName, userName, userName,
	)
	scimURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())
	req, _ := http.NewRequest(http.MethodPost, scimURL, stringReader(scimBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Cookie", "UC_TOKEN="+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

type propagateSchemaRequest struct {
	Principal      string `json:"principal"`
	Type           string `json:"type"`
	Catalog        string `json:"catalog"`
	Schema         string `json:"schema"`
	IncludeCatalog bool   `json:"include_catalog"`
}

func (app *App) PropagateSchemaHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	body, _ := io.ReadAll(r.Body)
	var req propagateSchemaRequest
	if err := json.Unmarshal(body, &req); err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("invalid request: %w", err))
		return
	}

	users, err := resolvePrincipal(r, req.Principal, req.Type)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	client := newUCClient()
	token := getUCAdminToken()
	schemaFull := req.Catalog + "." + req.Schema

	volsURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes?catalog_name=%s&schema_name=%s", getUCDirectURL(), req.Catalog, req.Schema)
	volsReq, _ := http.NewRequest(http.MethodGet, volsURL, nil)
	volsReq.Header.Set("Authorization", "Bearer "+token)
	volsReq.Header.Set("Cookie", "UC_TOKEN="+token)
	volsResp, err := client.Do(volsReq)
	var volumes []string
	if err == nil {
		vBody, _ := io.ReadAll(volsResp.Body)
		volsResp.Body.Close()
		var vResult struct {
			Volumes []struct {
				Name string `json:"name"`
			} `json:"volumes"`
		}
		json.Unmarshal(vBody, &vResult)
		for _, v := range vResult.Volumes {
			volumes = append(volumes, schemaFull+"."+v.Name)
		}
	}

	tabsURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables?catalog_name=%s&schema_name=%s", getUCDirectURL(), req.Catalog, req.Schema)
	tabsReq, _ := http.NewRequest(http.MethodGet, tabsURL, nil)
	tabsReq.Header.Set("Authorization", "Bearer "+token)
	tabsReq.Header.Set("Cookie", "UC_TOKEN="+token)
	tabsResp, err := client.Do(tabsReq)
	var tables []string
	if err == nil {
		tBody, _ := io.ReadAll(tabsResp.Body)
		tabsResp.Body.Close()
		var tResult struct {
			Tables []struct {
				Name string `json:"name"`
			} `json:"tables"`
		}
		json.Unmarshal(tBody, &tResult)
		for _, t := range tResult.Tables {
			tables = append(tables, schemaFull+"."+t.Name)
		}
	}

	granted := 0
	for _, user := range users {
		ensureSCIMUser(client, token, user)

		if req.IncludeCatalog {
			grantUCPermission(client, token, "catalog", req.Catalog, user, "USE CATALOG")
			granted++
		}

		grantUCPermission(client, token, "schema", schemaFull, user, "USE SCHEMA")
		granted++

		for _, vol := range volumes {
			grantUCPermission(client, token, "volume", vol, user, "READ VOLUME")
			granted++
		}

		for _, tbl := range tables {
			grantUCPermission(client, token, "table", tbl, user, "SELECT")
			granted++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","users":%d,"grants":%d,"volumes":%d,"tables":%d}`,
		len(users), granted, len(volumes), len(tables))
}

func grantUCPermission(client *http.Client, token, resType, fullName, principal, privilege string) {
	body := fmt.Sprintf(`{"changes":[{"principal":"%s","add":["%s"]}]}`, principal, privilege)
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/%s/%s", getUCDirectURL(), resType, fullName)
	req, _ := http.NewRequest(http.MethodPatch, ucURL, stringReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Cookie", "UC_TOKEN="+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}
