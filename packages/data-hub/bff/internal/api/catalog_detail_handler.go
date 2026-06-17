package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

const (
	CatalogDetailPath   = ApiPathPrefix + "/catalogs/:name/detail"
	CatalogMembersPath  = ApiPathPrefix + "/catalogs/:name/members"
	SetCatalogAdminPath = ApiPathPrefix + "/catalogs/:name/set-admin"
)

type CatalogDetail struct {
	Name    string       `json:"name"`
	Comment string       `json:"comment"`
	Schemas []SchemaInfo `json:"schemas"`
	Members []MemberInfo `json:"members"`
}

type SchemaInfo struct {
	Name    string       `json:"name"`
	Comment string       `json:"comment"`
	Tables  []TableInfo  `json:"tables"`
	Volumes []VolumeInfo `json:"volumes"`
}

type TableInfo struct {
	Name            string       `json:"name"`
	Format          string       `json:"data_source_format"`
	TableType       string       `json:"table_type"`
	StorageLocation string       `json:"storage_location"`
	Comment         string       `json:"comment"`
	Columns         []ColumnInfo `json:"columns"`
}

type ColumnInfo struct {
	Name     string `json:"name"`
	TypeName string `json:"type_name"`
	Comment  string `json:"comment"`
	Position int    `json:"position"`
}

type VolumeInfo struct {
	Name            string `json:"name"`
	Type            string `json:"volume_type"`
	StorageLocation string `json:"storage_location"`
	Comment         string `json:"comment"`
}

type MemberInfo struct {
	Email      string   `json:"email"`
	Role       string   `json:"role"`
	Privileges []string `json:"privileges"`
}

func (app *App) CatalogDetailHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	client := newUCClient()

	schemasURL := fmt.Sprintf("%s/api/2.1/unity-catalog/schemas?catalog_name=%s", getUCDirectURL(), name)
	schemasReq, _ := ucSmartReadRequest(r, http.MethodGet, schemasURL, nil)
	schemasResp, err := client.Do(schemasReq)
	var schemas []SchemaInfo
	if err == nil {
		body, _ := io.ReadAll(schemasResp.Body)
		schemasResp.Body.Close()
		var result struct {
			Schemas []struct {
				Name    string `json:"name"`
				Comment string `json:"comment"`
			} `json:"schemas"`
		}
		json.Unmarshal(body, &result)
		for _, s := range result.Schemas {
			si := SchemaInfo{Name: s.Name, Comment: s.Comment}

			tablesURL := fmt.Sprintf("%s/api/2.1/unity-catalog/tables?catalog_name=%s&schema_name=%s", getUCDirectURL(), name, s.Name)
			tablesReq, _ := ucSmartReadRequest(r, http.MethodGet, tablesURL, nil)
			tablesResp, tErr := client.Do(tablesReq)
			if tErr == nil {
				tBody, _ := io.ReadAll(tablesResp.Body)
				tablesResp.Body.Close()
				var tResult struct {
					Tables []struct {
						Name            string `json:"name"`
						Format          string `json:"data_source_format"`
						TableType       string `json:"table_type"`
						StorageLocation string `json:"storage_location"`
						Comment         string `json:"comment"`
						Columns         []struct {
							Name     string `json:"name"`
							TypeName string `json:"type_name"`
							Comment  string `json:"comment"`
							Position int    `json:"position"`
						} `json:"columns"`
					} `json:"tables"`
				}
				json.Unmarshal(tBody, &tResult)
				for _, t := range tResult.Tables {
					ti := TableInfo{
						Name:            t.Name,
						Format:          t.Format,
						TableType:       t.TableType,
						StorageLocation: t.StorageLocation,
						Comment:         t.Comment,
					}
					for _, c := range t.Columns {
						ti.Columns = append(ti.Columns, ColumnInfo{
							Name:     c.Name,
							TypeName: c.TypeName,
							Comment:  c.Comment,
							Position: c.Position,
						})
					}
					si.Tables = append(si.Tables, ti)
				}
			}

			volsURL := fmt.Sprintf("%s/api/2.1/unity-catalog/volumes?catalog_name=%s&schema_name=%s", getUCDirectURL(), name, s.Name)
			volsReq, _ := ucSmartReadRequest(r, http.MethodGet, volsURL, nil)
			volsResp, vErr := client.Do(volsReq)
			if vErr == nil {
				vBody, _ := io.ReadAll(volsResp.Body)
				volsResp.Body.Close()
				var vResult struct {
					Volumes []struct {
						Name            string `json:"name"`
						Type            string `json:"volume_type"`
						StorageLocation string `json:"storage_location"`
						Comment         string `json:"comment"`
					} `json:"volumes"`
				}
				json.Unmarshal(vBody, &vResult)
				for _, v := range vResult.Volumes {
					si.Volumes = append(si.Volumes, VolumeInfo{
						Name:            v.Name,
						Type:            v.Type,
						StorageLocation: v.StorageLocation,
						Comment:         v.Comment,
					})
				}
			}

			schemas = append(schemas, si)
		}
	}

	groupName := "uc-" + name
	groupURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), groupName)
	groupReq, _ := ucRequest(r, http.MethodGet, groupURL, nil)
	groupResp, err := client.Do(groupReq)
	var members []MemberInfo
	if err == nil {
		body, _ := io.ReadAll(groupResp.Body)
		groupResp.Body.Close()
		var group struct {
			Users    []string `json:"users"`
			Metadata struct {
				Annotations map[string]string `json:"annotations"`
			} `json:"metadata"`
		}
		json.Unmarshal(body, &group)

		adminSet := make(map[string]bool)
		if admins, ok := group.Metadata.Annotations["uc.redhat.com/catalog-admins"]; ok {
			for _, a := range strings.Split(admins, ",") {
				adminSet[strings.TrimSpace(a)] = true
			}
		}

		for _, u := range group.Users {
			role := "Reader"
			privs := []string{"USE CATALOG"}
			if adminSet[u] {
				role = "Catalog Admin"
				privs = []string{"USE CATALOG", "CREATE SCHEMA", "SELECT", "MODIFY"}
			}
			members = append(members, MemberInfo{
				Email:      u,
				Role:       role,
				Privileges: privs,
			})
		}
	}

	detail := CatalogDetail{
		Name:    name,
		Schemas: schemas,
		Members: members,
	}

	result, _ := json.Marshal(detail)
	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

func (app *App) SetCatalogAdminHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	client := newUCClient()

	var req struct {
		Email string `json:"email"`
	}
	body, _ := io.ReadAll(r.Body)
	json.Unmarshal(body, &req)

	// 1. Grant UC permissions
	grantBody := fmt.Sprintf(`{"changes":[{"principal":"%s","add":["USE CATALOG","CREATE SCHEMA","SELECT","MODIFY"]}]}`, req.Email)
	grantURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/catalog/%s", getUCDirectURL(), name)
	grantReq, _ := ucAdminRequest(r, http.MethodPatch, grantURL, stringReader(grantBody))
	grantResp, err := client.Do(grantReq)
	if err != nil {
		app.serverErrorResponse(w, r, err)
		return
	}
	grantResp.Body.Close()

	// 2. Update OCP Group annotation to track catalog admins
	groupName := "uc-" + name
	groupURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), groupName)

	getReq, _ := ucRequest(r, http.MethodGet, groupURL, nil)
	getResp, err := client.Do(getReq)
	if err == nil {
		getBody, _ := io.ReadAll(getResp.Body)
		getResp.Body.Close()

		var group map[string]interface{}
		json.Unmarshal(getBody, &group)

		metadata, _ := group["metadata"].(map[string]interface{})
		annotations, _ := metadata["annotations"].(map[string]interface{})
		if annotations == nil {
			annotations = map[string]interface{}{}
		}

		existing := ""
		if v, ok := annotations["uc.redhat.com/catalog-admins"].(string); ok {
			existing = v
		}
		if !strings.Contains(existing, req.Email) {
			if existing != "" {
				existing += ","
			}
			existing += req.Email
		}
		annotations["uc.redhat.com/catalog-admins"] = existing
		metadata["annotations"] = annotations

		patchBody, _ := json.Marshal(group)
		patchReq, _ := ucRequest(r, http.MethodPut, groupURL, stringReader(string(patchBody)))
		patchResp, err := client.Do(patchReq)
		if err == nil {
			patchResp.Body.Close()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","email":"%s","role":"Catalog Admin","catalog":"%s"}`, req.Email, name)
}

func (app *App) AddCatalogMemberHandler(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	name := ps.ByName("name")
	client := newUCClient()

	var req struct {
		Email string `json:"email"`
	}
	body, _ := io.ReadAll(r.Body)
	json.Unmarshal(body, &req)

	// 1. Create SCIM user if not exists
	scimBody := fmt.Sprintf(`{"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],"userName":"%s","displayName":"%s","active":true,"emails":[{"value":"%s","primary":true}]}`, req.Email, req.Email, req.Email)
	scimURL := fmt.Sprintf("%s/api/1.0/unity-control/scim2/Users", getUCDirectURL())
	scimReq, _ := ucAdminRequest(r, http.MethodPost, scimURL, stringReader(scimBody))
	scimResp, err := client.Do(scimReq)
	if err == nil {
		scimResp.Body.Close()
	}

	// 2. Grant USE CATALOG
	grantBody := fmt.Sprintf(`{"changes":[{"principal":"%s","add":["USE CATALOG"]}]}`, req.Email)
	grantURL := fmt.Sprintf("%s/api/2.1/unity-catalog/permissions/catalog/%s", getUCDirectURL(), name)
	grantReq, _ := ucAdminRequest(r, http.MethodPatch, grantURL, stringReader(grantBody))
	grantResp, err := client.Do(grantReq)
	if err == nil {
		grantResp.Body.Close()
	}

	// 3. Add user to OCP Group
	groupName := "uc-" + name
	groupURL := fmt.Sprintf("%s/apis/user.openshift.io/v1/groups/%s", getK8sAPIURL(), groupName)
	getReq, _ := ucRequest(r, http.MethodGet, groupURL, nil)
	getResp, err := client.Do(getReq)
	if err == nil {
		getBody, _ := io.ReadAll(getResp.Body)
		getResp.Body.Close()

		var group map[string]interface{}
		json.Unmarshal(getBody, &group)

		users, _ := group["users"].([]interface{})
		alreadyMember := false
		for _, u := range users {
			if u.(string) == req.Email {
				alreadyMember = true
				break
			}
		}
		if !alreadyMember {
			users = append(users, req.Email)
			group["users"] = users
			putBody, _ := json.Marshal(group)
			putReq, _ := ucRequest(r, http.MethodPut, groupURL, stringReader(string(putBody)))
			putResp, err := client.Do(putReq)
			if err == nil {
				putResp.Body.Close()
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","email":"%s","catalog":"%s"}`, req.Email, name)
}
