package api

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/julienschmidt/httprouter"
)

const TracesPath = ApiPathPrefix + "/traces"

type TraceInfo struct {
	TraceID    string `json:"trace_id"`
	Timestamp  int64  `json:"timestamp"`
	Status     string `json:"status"`
	DurationMs int64  `json:"duration_ms"`
	Request    string `json:"request"`
	Response   string `json:"response"`
	AppName    string `json:"app_name"`
	TraceName  string `json:"trace_name"`
	Tokens     int64  `json:"tokens"`
}

type TracesResponse struct {
	Traces []TraceInfo `json:"traces"`
	Total  int         `json:"total"`
}

func (app *App) TracesHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	experimentID := r.URL.Query().Get("experiment_id")
	if experimentID == "" {
		experimentID = getEnvOrDefault("MLFLOW_EXPERIMENT_ID", "59")
	}
	appNameFilter := r.URL.Query().Get("app_name")
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	mlflowURL := getEnvOrDefault("MLFLOW_URL", "")
	workspace := getEnvOrDefault("MLFLOW_WORKSPACE", "mstoklus")

	tracesURL := fmt.Sprintf("%s/mlflow/api/2.0/mlflow/traces?experiment_ids=%s&max_results=%d",
		mlflowURL, experimentID, limit*3)

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // #nosec G402 -- internal
		},
	}

	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, tracesURL, nil)

	token := r.Header.Get("x-forwarded-access-token")
	if token == "" {
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			token = auth[7:]
		}
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("x-mlflow-workspace", workspace)

	resp, err := client.Do(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TracesResponse{Traces: []TraceInfo{}, Total: 0})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(TracesResponse{Traces: []TraceInfo{}, Total: 0})
		return
	}

	body, _ := io.ReadAll(resp.Body)

	var mlflowResp struct {
		Traces []struct {
			RequestID       string `json:"request_id"`
			ExperimentID    string `json:"experiment_id"`
			TimestampMs     int64  `json:"timestamp_ms"`
			ExecutionTimeMs int64  `json:"execution_time_ms"`
			Status          string `json:"status"`
			RequestMetadata []struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			} `json:"request_metadata"`
			Tags []struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			} `json:"tags"`
		} `json:"traces"`
	}
	json.Unmarshal(body, &mlflowResp)

	var traces []TraceInfo
	for _, t := range mlflowResp.Traces {
		tagMap := make(map[string]string)
		for _, tag := range t.Tags {
			tagMap[tag.Key] = tag.Value
		}

		metaMap := make(map[string]string)
		for _, m := range t.RequestMetadata {
			metaMap[m.Key] = m.Value
		}

		appName := tagMap["app_name"]
		traceName := tagMap["mlflow.traceName"]

		if appNameFilter != "" && appName != appNameFilter {
			continue
		}

		input := metaMap["mlflow.traceInputs"]

		requestText := extractUserQuery(input)
		responseText := extractAssistantResponse(metaMap["mlflow.traceOutputs"])

		var totalTokens int64
		if tokenUsage, ok := metaMap["mlflow.trace.tokenUsage"]; ok {
			var usage struct {
				TotalTokens int64 `json:"total_tokens"`
			}
			json.Unmarshal([]byte(tokenUsage), &usage)
			totalTokens = usage.TotalTokens
		}

		traces = append(traces, TraceInfo{
			TraceID:    t.RequestID,
			Timestamp:  t.TimestampMs,
			Status:     t.Status,
			DurationMs: t.ExecutionTimeMs,
			Request:    requestText,
			Response:   responseText,
			AppName:    appName,
			TraceName:  traceName,
			Tokens:     totalTokens,
		})

		if len(traces) >= limit {
			break
		}
	}

	if traces == nil {
		traces = []TraceInfo{}
	}

	result := TracesResponse{Traces: traces, Total: len(traces)}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func extractUserQuery(input string) string {
	// LangGraph format: {"messages": [{"content": "user query", "type": "human", ...}]}
	var lgInput struct {
		Messages []struct {
			Content string `json:"content"`
			Type    string `json:"type"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(input), &lgInput); err == nil {
		for _, m := range lgInput.Messages {
			if m.Type == "human" && m.Content != "" {
				return m.Content
			}
		}
	}

	// OGX format: look for "User: " marker in raw string (JSON may be truncated)
	if idx := strings.LastIndex(input, "User: "); idx >= 0 {
		query := input[idx+6:]
		query = strings.TrimSuffix(query, "\"}")
		query = strings.TrimSuffix(query, "\",")
		query = strings.TrimRight(query, "\"}")
		if len(query) > 200 {
			return query[:200] + "..."
		}
		return query
	}

	// OGX format: try to extract "input" field value
	if idx := strings.Index(input, "\"input\": \""); idx >= 0 {
		start := idx + 10
		end := strings.Index(input[start:], "\\n\\n")
		if end > 0 {
			return input[start : start+end]
		}
	}

	if len(input) > 200 {
		return input[:200] + "..."
	}
	return input
}

func extractAssistantResponse(output string) string {
	// Try to extract readable text from response JSON
	var items []struct {
		Type    string `json:"type"`
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal([]byte(output), &items); err == nil {
		for _, item := range items {
			if item.Type == "message" {
				for _, c := range item.Content {
					if c.Text != "" {
						if len(c.Text) > 300 {
							return c.Text[:300] + "..."
						}
						return c.Text
					}
				}
			}
		}
	}

	if len(output) > 300 {
		return output[:300] + "..."
	}
	return output
}
