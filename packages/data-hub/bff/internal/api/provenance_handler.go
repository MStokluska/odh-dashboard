package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/julienschmidt/httprouter"
)

func getMilvusURL() string {
	if url := os.Getenv("MILVUS_URL"); url != "" {
		return url
	}
	return ""
}

func getMilvusCollection() string {
	if col := os.Getenv("MILVUS_COLLECTION"); col != "" {
		return col
	}
	return "underwriting_guidelines"
}

type milvusQueryRequest struct {
	CollectionName string   `json:"collectionName"`
	Filter         string   `json:"filter"`
	OutputFields   []string `json:"outputFields"`
	Limit          int      `json:"limit"`
}

type milvusQueryResponse struct {
	Code int `json:"code"`
	Data []struct {
		SourceDoc string `json:"source_doc"`
	} `json:"data"`
}

type milvusStatsResponse struct {
	Count      int      `json:"count"`
	SourceDocs []string `json:"source_docs"`
	Error      string   `json:"error,omitempty"`
}

func (app *App) MilvusStatsHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	volume := ps.ByName("volume")
	if volume == "" {
		app.badRequestResponse(w, r, fmt.Errorf("volume name is required"))
		return
	}

	milvusURL := getMilvusURL()
	collection := getMilvusCollection()

	reqBody := milvusQueryRequest{
		CollectionName: collection,
		Filter:         fmt.Sprintf(`source_doc like "%%%s%%"`, volume),
		OutputFields:   []string{"source_doc"},
		Limit:          1000,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // #nosec G402 -- internal cluster
		},
	}

	resp, err := client.Post(
		fmt.Sprintf("%s/v2/vectordb/entities/query", milvusURL),
		"application/json",
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(milvusStatsResponse{
			Count:      0,
			SourceDocs: []string{},
			Error:      fmt.Sprintf("Milvus unreachable: %v", err),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(milvusStatsResponse{
			Count:      0,
			SourceDocs: []string{},
			Error:      fmt.Sprintf("Milvus returned status %d", resp.StatusCode),
		})
		return
	}

	var milvusResp milvusQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&milvusResp); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(milvusStatsResponse{
			Count:      0,
			SourceDocs: []string{},
			Error:      fmt.Sprintf("Failed to parse Milvus response: %v", err),
		})
		return
	}

	seen := make(map[string]bool)
	var uniqueDocs []string
	for _, d := range milvusResp.Data {
		if d.SourceDoc != "" && !seen[d.SourceDoc] {
			seen[d.SourceDoc] = true
			uniqueDocs = append(uniqueDocs, d.SourceDoc)
		}
	}

	if uniqueDocs == nil {
		uniqueDocs = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(milvusStatsResponse{
		Count:      len(milvusResp.Data),
		SourceDocs: uniqueDocs,
	})
}
