package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

const (
	SchemasPath    = ApiPathPrefix + "/catalogs/:name/schemas"
	TablesPath     = ApiPathPrefix + "/catalogs/:name/schemas/:schema/tables"
	VolumesPath    = ApiPathPrefix + "/catalogs/:name/schemas/:schema/volumes"
	ProvenancePath = ApiPathPrefix + "/catalogs/:name/schemas/:schema/volumes/:volume/milvus-stats"
)

func (app *App) ListSchemasHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/schemas?catalog_name=%s", getUCDirectURL(), catalogName)

	req, err := ucSmartReadRequest(r, http.MethodGet, ucURL, nil)
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
	proxyResponse(w, resp)
}

func (app *App) ListTablesHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables?catalog_name=%s&schema_name=%s", getUCDirectURL(), catalogName, schemaName)

	req, err := ucSmartReadRequest(r, http.MethodGet, ucURL, nil)
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
	proxyResponse(w, resp)
}

func (app *App) ListVolumesHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes?catalog_name=%s&schema_name=%s", getUCDirectURL(), catalogName, schemaName)

	req, err := ucSmartReadRequest(r, http.MethodGet, ucURL, nil)
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
	proxyResponse(w, resp)
}

func (app *App) CreateSchemaHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ensureUCSCIMUser("admin")
	user := getUserIdentity(r)
	bodyBytes, _ := io.ReadAll(r.Body)
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/schemas", getUCDirectURL())

	// Parse catalog_name from body
	var schemaReq struct {
		Name        string `json:"name"`
		CatalogName string `json:"catalog_name"`
	}
	json.Unmarshal(bodyBytes, &schemaReq)

	for attempt := 0; attempt < 2; attempt++ {
		req, err := ucAdminRequest(r, http.MethodPost, ucURL, strings.NewReader(string(bodyBytes)))
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		resp, err := newUCClient().Do(req)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 403 && attempt == 0 {
			scimProvisioned = make(map[string]bool)
			ensureUCSCIMUser("admin")
			continue
		}

		// Auto-grant permissions to creating user
		if resp.StatusCode == 200 && user != "" && schemaReq.CatalogName != "" && schemaReq.Name != "" {
			fullName := schemaReq.CatalogName + "." + schemaReq.Name
			ensureUCSCIMUser(user)
			client := newUCClient()
			grantUCPermission(client, "schema", fullName, user, "USE SCHEMA")
			grantUCPermission(client, "schema", fullName, user, "CREATE TABLE")
			grantUCPermission(client, "schema", fullName, user, "CREATE VOLUME")
			slog.Info("Auto-granted schema permissions", "schema", fullName, "user", user)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
}

func (app *App) CreateTableHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	user := getUserIdentity(r)
	slog.Info("CreateTableHandler called", "user", user)
	ensureUCSCIMUser("admin")

	bodyBytes, _ := io.ReadAll(r.Body)
	var tableReq struct {
		Name        string `json:"name"`
		CatalogName string `json:"catalog_name"`
		SchemaName  string `json:"schema_name"`
	}
	json.Unmarshal(bodyBytes, &tableReq)

	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables", getUCDirectURL())

	for attempt := 0; attempt < 2; attempt++ {
		req, err := ucAdminRequest(r, http.MethodPost, ucURL, strings.NewReader(string(bodyBytes)))
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		resp, err := newUCClient().Do(req)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 403 && attempt == 0 {
			scimProvisioned = make(map[string]bool)
			ensureUCSCIMUser("admin")
			continue
		}

		if resp.StatusCode == 200 && user != "" && tableReq.CatalogName != "" && tableReq.SchemaName != "" && tableReq.Name != "" {
			fullName := tableReq.CatalogName + "." + tableReq.SchemaName + "." + tableReq.Name
			ensureUCSCIMUser(user)
			client := newUCClient()
			grantUCPermission(client, "table", fullName, user, "SELECT")
			grantUCPermission(client, "table", fullName, user, "MODIFY")
			slog.Info("Auto-granted table permissions", "table", fullName, "user", user)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (app *App) CreateVolumeHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	user := getUserIdentity(r)
	ensureUCSCIMUser("admin")
	bodyBytes, _ := io.ReadAll(r.Body)
	var volReq struct {
		Name        string `json:"name"`
		CatalogName string `json:"catalog_name"`
		SchemaName  string `json:"schema_name"`
	}
	json.Unmarshal(bodyBytes, &volReq)

	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes", getUCDirectURL())

	for attempt := 0; attempt < 2; attempt++ {
		req, err := ucAdminRequest(r, http.MethodPost, ucURL, strings.NewReader(string(bodyBytes)))
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		resp, err := newUCClient().Do(req)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 403 && attempt == 0 {
			scimProvisioned = make(map[string]bool)
			ensureUCSCIMUser("admin")
			continue
		}

		if resp.StatusCode == 200 && user != "" && volReq.CatalogName != "" && volReq.SchemaName != "" && volReq.Name != "" {
			fullName := volReq.CatalogName + "." + volReq.SchemaName + "." + volReq.Name
			ensureUCSCIMUser(user)
			client := newUCClient()
			grantUCPermission(client, "volume", fullName, user, "READ VOLUME")
			grantUCPermission(client, "volume", fullName, user, "WRITE VOLUME")
			slog.Info("Auto-granted volume permissions", "volume", fullName, "user", user)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
}

func (app *App) DeleteSchemaHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/schemas/%s.%s", getUCDirectURL(), catalogName, schemaName)

	req, err := ucAdminRequest(r, http.MethodDelete, ucURL, nil)
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
	proxyResponse(w, resp)
}

func (app *App) DeleteTableHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ensureUCSCIMUser("admin")
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	tableName := ps.ByName("table")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables/%s.%s.%s", getUCDirectURL(), catalogName, schemaName, tableName)

	for attempt := 0; attempt < 2; attempt++ {
		req, _ := ucAdminRequest(r, http.MethodDelete, ucURL, nil)
		resp, err := newUCClient().Do(req)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 403 && attempt == 0 {
			scimProvisioned = make(map[string]bool)
			ensureUCSCIMUser("admin")
			continue
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
}

func (app *App) DeleteVolumeHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ensureUCSCIMUser("admin")
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	volumeName := ps.ByName("volume")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes/%s.%s.%s", getUCDirectURL(), catalogName, schemaName, volumeName)

	for attempt := 0; attempt < 2; attempt++ {
		req, _ := ucAdminRequest(r, http.MethodDelete, ucURL, nil)
		resp, err := newUCClient().Do(req)
		if err != nil {
			app.serverErrorResponse(w, r, err)
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 403 && attempt == 0 {
			scimProvisioned = make(map[string]bool)
			ensureUCSCIMUser("admin")
			continue
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}
}
