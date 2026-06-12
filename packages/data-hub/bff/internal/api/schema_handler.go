package api

import (
	"fmt"
	"net/http"

	"github.com/julienschmidt/httprouter"
)

const (
	SchemasPath    = ApiPathPrefix + "/catalogs/:name/schemas"
	TablesPath     = ApiPathPrefix + "/catalogs/:name/schemas/:schema/tables"
	VolumesPath    = ApiPathPrefix + "/catalogs/:name/schemas/:schema/volumes"
	ProvenancePath = ApiPathPrefix + "/catalogs/:name/schemas/:schema/volumes/:volume/milvus-stats"
)

func (app *App) CreateSchemaHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/schemas", getUCDirectURL())

	req, err := ucAdminRequest(r, http.MethodPost, ucURL, r.Body)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	_ = catalogName
	resp, err := newUCClient().Do(req)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

func (app *App) CreateTableHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables", getUCDirectURL())

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

func (app *App) CreateVolumeHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	ucURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes", getUCDirectURL())

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
