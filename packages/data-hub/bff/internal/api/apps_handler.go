package api

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/julienschmidt/httprouter"
)

const (
	AppsPath = ApiPathPrefix + "/apps"
	AppPath  = ApiPathPrefix + "/apps/:name"
)

type RegisteredApp struct {
	Name               string   `json:"name"`
	DisplayName        string   `json:"displayName"`
	Type               string   `json:"type"`
	Endpoint           string   `json:"endpoint"`
	MlflowExperiment   string   `json:"mlflowExperiment"`
	MlflowExperimentId string   `json:"mlflowExperimentId"`
	MlflowWorkspace    string   `json:"mlflowWorkspace"`
	MilvusCollection   string   `json:"milvusCollection"`
	Volumes            []string `json:"volumes"`
	RegisteredAt       string   `json:"registeredAt"`
}

type AppsRegistry struct {
	Apps []RegisteredApp `json:"apps"`
}

func getMarquezAPIURL() string {
	if url := os.Getenv("MARQUEZ_API_URL"); url != "" {
		return url
	}
	return ""
}

func getAppsNamespace() string {
	if ns := os.Getenv("APPS_NAMESPACE"); ns != "" {
		return ns
	}
	return ""
}

func (app *App) ListAppsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	registry := loadAppsRegistry(r)
	result, _ := json.Marshal(registry)
	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

func (app *App) RegisterAppHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	body, _ := io.ReadAll(r.Body)
	var newApp RegisteredApp
	if err := json.Unmarshal(body, &newApp); err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("invalid request: %w", err))
		return
	}

	if newApp.Name == "" {
		app.badRequestResponse(w, r, fmt.Errorf("name is required"))
		return
	}

	newApp.RegisteredAt = time.Now().UTC().Format(time.RFC3339)

	registry := loadAppsRegistry(r)
	for i, a := range registry.Apps {
		if a.Name == newApp.Name {
			registry.Apps[i] = newApp
			saveAppsRegistry(r, registry)
			emitMarquezLineage(newApp)
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"status":"updated","app":"%s"}`, newApp.Name)
			return
		}
	}

	registry.Apps = append(registry.Apps, newApp)
	saveAppsRegistry(r, registry)
	emitMarquezLineage(newApp)

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"created","app":"%s"}`, newApp.Name)
}

func (app *App) DeleteAppHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	registry := loadAppsRegistry(r)

	filtered := []RegisteredApp{}
	for _, a := range registry.Apps {
		if a.Name != name {
			filtered = append(filtered, a)
		}
	}
	registry.Apps = filtered
	saveAppsRegistry(r, registry)

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"deleted","app":"%s"}`, name)
}

func loadAppsRegistry(r *http.Request) AppsRegistry {
	client := newUCClient()
	ns := getAppsNamespace()
	url := fmt.Sprintf("%s/api/v1/namespaces/%s/configmaps/uc-registered-apps", getK8sAPIURL(), ns)

	req, _ := ucRequest(r, http.MethodGet, url, nil)
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return AppsRegistry{Apps: []RegisteredApp{}}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var cm struct {
		Data map[string]string `json:"data"`
	}
	json.Unmarshal(body, &cm)

	var registry AppsRegistry
	if raw, ok := cm.Data["apps.json"]; ok {
		json.Unmarshal([]byte(raw), &registry)
	}
	if registry.Apps == nil {
		registry.Apps = []RegisteredApp{}
	}
	return registry
}

func saveAppsRegistry(r *http.Request, registry AppsRegistry) {
	client := newUCClient()
	ns := getAppsNamespace()

	appsJSON, _ := json.Marshal(registry)

	cm := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata": map[string]string{
			"name":      "uc-registered-apps",
			"namespace": ns,
		},
		"data": map[string]string{
			"apps.json": string(appsJSON),
		},
	}
	cmJSON, _ := json.Marshal(cm)

	url := fmt.Sprintf("%s/api/v1/namespaces/%s/configmaps/uc-registered-apps", getK8sAPIURL(), ns)

	getReq, _ := ucRequest(r, http.MethodGet, url, nil)
	getResp, err := client.Do(getReq)
	if err == nil && getResp.StatusCode == 200 {
		getResp.Body.Close()
		putReq, _ := ucRequest(r, http.MethodPut, url, stringReader(string(cmJSON)))
		putResp, _ := client.Do(putReq)
		if putResp != nil {
			putResp.Body.Close()
		}
	} else {
		if getResp != nil {
			getResp.Body.Close()
		}
		createURL := fmt.Sprintf("%s/api/v1/namespaces/%s/configmaps", getK8sAPIURL(), ns)
		createReq, _ := ucRequest(r, http.MethodPost, createURL, stringReader(string(cmJSON)))
		createResp, _ := client.Do(createReq)
		if createResp != nil {
			createResp.Body.Close()
		}
	}
}

func emitMarquezLineage(a RegisteredApp) {
	marquezURL := getMarquezAPIURL()
	runID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	type catalogSchema struct {
		catalog string
		schema  string
	}
	seen := make(map[string]bool)
	var schemas []catalogSchema
	for _, vol := range a.Volumes {
		parts := splitFullName(vol)
		if len(parts) >= 3 {
			key := parts[0] + "." + parts[1]
			if !seen[key] {
				seen[key] = true
				schemas = append(schemas, catalogSchema{catalog: parts[0], schema: parts[1]})
			}
		}
	}

	inputs := []map[string]string{}
	for _, s := range schemas {
		inputs = append(inputs, map[string]string{
			"namespace": s.catalog,
			"name":      s.schema + ".rag_endpoint",
		})
	}

	event := map[string]interface{}{
		"eventType": "COMPLETE",
		"eventTime": now,
		"producer":  "data-hub-ui",
		"schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent",
		"run":       map[string]string{"runId": runID},
		"job":       map[string]string{"namespace": "mlflow", "name": a.Name},
		"inputs":    inputs,
		"outputs": []map[string]string{
			{"namespace": "mlflow", "name": a.Name + "-responses"},
		},
	}

	eventJSON, _ := json.Marshal(event)

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // #nosec G402 -- internal
		},
	}
	resp, err := client.Post(
		marquezURL+"/api/v1/lineage",
		"application/json",
		stringReader(string(eventJSON)),
	)
	if err == nil {
		resp.Body.Close()
	}
}

func splitFullName(fullName string) []string {
	parts := []string{}
	current := ""
	for _, c := range fullName {
		if c == '.' {
			parts = append(parts, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}
