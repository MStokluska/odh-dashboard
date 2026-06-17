package api

import (
	"fmt"
	"io"
	"net/http"

	"github.com/julienschmidt/httprouter"
)

const (
	CatalogsPath    = ApiPathPrefix + "/catalogs"
	CatalogPath     = ApiPathPrefix + "/catalogs/:name"
	PermissionsPath = ApiPathPrefix + "/catalogs/:name/permissions"
)

func (app *App) CatalogsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ensureUCSCIMUser(getUserIdentity(r))

	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs", getUCDirectURL())

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

func (app *App) CreateCatalogHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	if !isUCAdmin(r) {
		app.forbiddenResponse(w, r, "UC admin access required")
		return
	}

	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs", getUCDirectURL())

	req, err := ucAdminRequest(r, http.MethodPost, ucURL, r.Body)
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

func (app *App) DeleteCatalogHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	if !isUCAdmin(r) {
		app.forbiddenResponse(w, r, "UC admin access required")
		return
	}

	name := ps.ByName("name")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/catalogs/%s?force=true", getUCDirectURL(), name)

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

func (app *App) GetCatalogPermissionsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/catalog/%s", getUCDirectURL(), name)

	req, err := ucUserRequest(r, http.MethodGet, ucURL, nil)
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

func (app *App) UpdateCatalogPermissionsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/catalog/%s", getUCDirectURL(), name)

	req, err := ucAdminRequest(r, http.MethodPatch, ucURL, r.Body)
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

func (app *App) SCIMUsersHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	if !isUCAdmin(r) {
		app.forbiddenResponse(w, r, "UC admin access required")
		return
	}

	ucURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())

	req, err := ucAdminRequest(r, http.MethodGet, ucURL, nil)
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

func (app *App) CreateSCIMUserHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	if !isUCAdmin(r) {
		app.forbiddenResponse(w, r, "UC admin access required")
		return
	}

	ucURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())

	req, err := ucAdminRequest(r, http.MethodPost, ucURL, r.Body)
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

func (app *App) AdminCheckHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	admin := isUCAdmin(r)
	w.Header().Set("Content-Type", "application/json")
	if admin {
		fmt.Fprintf(w, `{"isAdmin":true,"canDelete":true}`)
	} else {
		fmt.Fprintf(w, `{"isAdmin":false,"canDelete":false}`)
	}
}

func (app *App) MetastorePermissionsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/metastore_summary", getUCDirectURL())

	metaReq, err := ucAdminRequest(r, http.MethodGet, ucURL, nil)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	resp, err := newUCClient().Do(metaReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}
