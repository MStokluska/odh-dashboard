package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/julienschmidt/httprouter"
)

const (
	TableVersionsPath = ApiPathPrefix + "/catalogs/:name/schemas/:schema/tables/:table/versions"
)

type FileChanged struct {
	Filename  string `json:"filename"`
	Action    string `json:"action"`
	LOB       string `json:"lob,omitempty"`
	SizeBytes int64  `json:"size_bytes,omitempty"`
	OldSize   int64  `json:"old_size,omitempty"`
	NewSize   int64  `json:"new_size,omitempty"`
}

type DeltaStats struct {
	DeltaVersion   int           `json:"deltaVersion"`
	TotalRows      int           `json:"totalRows"`
	RowsAdded      int           `json:"rowsAdded"`
	RowsSuperseded int           `json:"rowsSuperseded"`
	Operation      string        `json:"operation"`
	FilesChanged   []FileChanged `json:"filesChanged,omitempty"`
}

type TableVersion struct {
	Version        string      `json:"version"`
	CreatedAt      string      `json:"createdAt"`
	DeltaStats     *DeltaStats `json:"deltaStats,omitempty"`
	DatasetVersion string      `json:"datasetVersion,omitempty"`
}

type TableVersionsResponse struct {
	TableName string         `json:"tableName"`
	Versions  []TableVersion `json:"versions"`
}

func (app *App) TableVersionsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	catalogName := ps.ByName("name")
	schemaName := ps.ByName("schema")
	tableName := ps.ByName("table")

	marquezAPIURL := os.Getenv("MARQUEZ_API_URL")
	if marquezAPIURL == "" {
		app.serverErrorResponse(w, r, fmt.Errorf("MARQUEZ_API_URL not configured"))
		return
	}

	datasetName := fmt.Sprintf("%s.%s", schemaName, tableName)
	versionsURL := fmt.Sprintf("%s/api/v1/namespaces/%s/datasets/%s/versions",
		marquezAPIURL, catalogName, datasetName)

	client := newUCClient()
	resp, err := client.Get(versionsURL)
	if err != nil {
		app.serverErrorResponse(w, r, fmt.Errorf("failed to fetch Marquez versions: %w", err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		app.serverErrorResponse(w, r, fmt.Errorf("failed to read Marquez response: %w", err))
		return
	}

	var marquezResp struct {
		Versions []struct {
			Version   string                 `json:"version"`
			CreatedAt string                 `json:"createdAt"`
			Facets    map[string]interface{} `json:"facets"`
		} `json:"versions"`
	}

	if err := json.Unmarshal(body, &marquezResp); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}

	result := TableVersionsResponse{
		TableName: fmt.Sprintf("%s.%s.%s", catalogName, schemaName, tableName),
		Versions:  make([]TableVersion, 0, len(marquezResp.Versions)),
	}

	seenDeltaVersions := make(map[int]bool)
	foundFirstCreate := false

	for _, v := range marquezResp.Versions {
		tv := TableVersion{
			Version:   v.Version,
			CreatedAt: v.CreatedAt,
		}

		if dvFacet, ok := v.Facets["datasetVersion"]; ok {
			if dvMap, ok := dvFacet.(map[string]interface{}); ok {
				if dv, ok := dvMap["datasetVersion"].(string); ok {
					tv.DatasetVersion = dv
				}
			}
		}

		if dsFacet, ok := v.Facets["deltaStats"]; ok {
			dsBytes, _ := json.Marshal(dsFacet)
			var ds DeltaStats
			if json.Unmarshal(dsBytes, &ds) == nil {
				if seenDeltaVersions[ds.DeltaVersion] {
					continue
				}
				if ds.Operation == "CREATE" {
					if foundFirstCreate {
						break
					}
					foundFirstCreate = true
				}
				seenDeltaVersions[ds.DeltaVersion] = true
				tv.DeltaStats = &ds
			}
		}

		result.Versions = append(result.Versions, tv)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
