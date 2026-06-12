package api

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/julienschmidt/httprouter"
)

const ConfigPath = ApiPathPrefix + "/config"

type uiConfig struct {
	MarquezURL         string `json:"marquezUrl"`
	MlflowURL          string `json:"mlflowUrl"`
	MlflowExperimentID string `json:"mlflowExperimentId"`
	MlflowWorkspace    string `json:"mlflowWorkspace"`
}

func (app *App) ConfigHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	cfg := uiConfig{
		MarquezURL:         getEnvOrDefault("MARQUEZ_URL", ""),
		MlflowURL:          getEnvOrDefault("MLFLOW_URL", ""),
		MlflowExperimentID: getEnvOrDefault("MLFLOW_EXPERIMENT_ID", ""),
		MlflowWorkspace:    getEnvOrDefault("MLFLOW_WORKSPACE", ""),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func getEnvOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
