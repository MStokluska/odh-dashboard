package api

import (
	"crypto/tls"
	"io"
	"net/http"
	"os"
	"strings"
)

func getK8sAPIURL() string {
	if url := os.Getenv("K8S_API_URL"); url != "" {
		return url
	}
	return "https://kubernetes.default.svc"
}

func getUCRouteURL() string {
	if url := os.Getenv("UC_ROUTE_URL"); url != "" {
		return url
	}
	return ""
}

func getUCDirectURL() string {
	if url := os.Getenv("UC_API_URL"); url != "" {
		return url
	}
	return getUCRouteURL()
}

func getUCBaseURL() string {
	return getUCRouteURL()
}

func newUCClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // #nosec G402 -- dev only
		},
	}
}

func ucRequest(r *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(r.Context(), method, url, body)
	if err != nil {
		return nil, err
	}
	if auth := r.Header.Get("Authorization"); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func ucAdminRequest(_ *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	token := os.Getenv("UC_ADMIN_TOKEN")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Cookie", "UC_TOKEN="+token)
	}
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func proxyResponse(w http.ResponseWriter, resp *http.Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func getUCAdminToken() string {
	return os.Getenv("UC_ADMIN_TOKEN")
}

func isUCAdmin(r *http.Request) bool {
	user := r.Header.Get("x-forwarded-access-token")
	if user == "" {
		user = r.Header.Get("kubeflow-userid")
	}

	adminUsers := os.Getenv("UC_ADMIN_USERS")
	if adminUsers == "" {
		adminUsers = "mstoklus@redhat.com"
	}
	for _, admin := range strings.Split(adminUsers, ",") {
		if strings.TrimSpace(admin) == user {
			return true
		}
	}
	return false
}
