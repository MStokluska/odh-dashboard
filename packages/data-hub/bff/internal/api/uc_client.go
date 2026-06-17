package api

import (
	"crypto/tls"
	"fmt"
	"io"
	"log/slog"
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

func getUserToken(r *http.Request) string {
	if token := r.Header.Get("x-forwarded-access-token"); token != "" {
		return token
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return auth[7:]
	}
	return ""
}

func ucUserRequest(r *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(r.Context(), method, url, body)
	if err != nil {
		return nil, err
	}
	token := getUserToken(r)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func ucRequest(r *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	return ucUserRequest(r, method, url, body)
}

func ucSmartReadRequest(r *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	if isUCAdmin(r) {
		return ucAdminRequest(r, method, url, body)
	}
	return ucUserRequest(r, method, url, body)
}

func getUCAdminURL() string {
	if url := os.Getenv("UC_ADMIN_URL"); url != "" {
		return url
	}
	return getUCDirectURL()
}

func ucAdminRequest(_ *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	adminURL := getUCAdminURL()
	if adminURL != "" && adminURL != getUCDirectURL() {
		url = strings.Replace(url, getUCDirectURL(), adminURL, 1)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}

	token := os.Getenv("UC_ADMIN_TOKEN")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("X-Auth-Request-User", "admin")
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

func getUserIdentity(r *http.Request) string {
	if user := r.Header.Get("X-Auth-Request-User"); user != "" {
		return user
	}
	if user := r.Header.Get("x-forwarded-user"); user != "" {
		return user
	}
	if user := r.Header.Get("kubeflow-userid"); user != "" {
		return user
	}
	return ""
}

var scimProvisioned = make(map[string]bool)

func ensureUCSCIMUser(userName string) {
	if userName == "" || scimProvisioned[userName] {
		return
	}

	slog.Info("ensureUCSCIMUser creating", "userName", userName)
	adminURL := getUCAdminURL()
	scimURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", adminURL)
	scimBody := fmt.Sprintf(`{"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],"userName":"%s","displayName":"%s","emails":[{"value":"%s","primary":true}],"active":true}`,
		userName, userName, userName)

	req, err := http.NewRequest(http.MethodPost, scimURL, strings.NewReader(scimBody))
	if err != nil {
		return
	}
	req.Header.Set("X-Auth-Request-User", "admin")
	req.Header.Set("Content-Type", "application/json")

	resp, err := newUCClient().Do(req)
	if err != nil {
		return
	}
	resp.Body.Close()
	scimProvisioned[userName] = true
}

func init() {
	go func() {
		ensureUCSCIMUser("admin")
	}()
}

var adminGroupCache = make(map[string]bool)

func isUCAdmin(r *http.Request) bool {
	user := getUserIdentity(r)
	if user == "" {
		return false
	}

	if adminGroupCache[user] {
		return true
	}

	groups := r.Header.Get("X-Auth-Request-Groups")
	if groups == "" {
		groups = r.Header.Get("X-Forwarded-Groups")
	}

	adminGroup := os.Getenv("UC_ADMIN_GROUP")
	if adminGroup == "" {
		adminGroup = "rhods-admins"
	}

	if groups != "" {
		for _, g := range strings.Split(groups, ",") {
			if strings.TrimSpace(g) == adminGroup {
				adminGroupCache[user] = true
				return true
			}
		}
	}

	saToken, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
	if err == nil {
		groupURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", "https://kubernetes.default.svc", adminGroup)
		req, err := http.NewRequest(http.MethodGet, groupURL, nil)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+string(saToken))
			resp, err := newUCClient().Do(req)
			if err == nil && resp.StatusCode == 200 {
				defer resp.Body.Close()
				body, _ := io.ReadAll(resp.Body)
				if strings.Contains(string(body), "\""+user+"\"") {
					adminGroupCache[user] = true
					return true
				}
			}
		}
	}

	adminUsers := os.Getenv("UC_ADMIN_USERS")
	if adminUsers != "" {
		for _, admin := range strings.Split(adminUsers, ",") {
			if strings.TrimSpace(admin) == user {
				return true
			}
		}
	}

	return false
}
