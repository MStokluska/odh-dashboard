package api

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/julienschmidt/httprouter"
)

const ConfigPath = ApiPathPrefix + "/config"

type uiConfig struct {
	MarquezURL    string `json:"marquezUrl"`
	MarquezAPIURL string `json:"marquezApiUrl"`
	MlflowURL     string `json:"mlflowUrl"`
}

func (app *App) ConfigHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	cfg := uiConfig{
		MarquezURL:    getEnvOrDefault("MARQUEZ_URL", ""),
		MarquezAPIURL: getEnvOrDefault("MARQUEZ_API_URL", ""),
		MlflowURL:     getEnvOrDefault("MLFLOW_URL", ""),
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
