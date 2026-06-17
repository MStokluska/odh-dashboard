package api

import (
	"context"
	"crypto/x509"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/opendatahub-io/mod-arch-library/bff/internal/integrations/bffclient"
	"github.com/opendatahub-io/mod-arch-library/bff/internal/integrations/bffclient/bffmocks"
	k8s "github.com/opendatahub-io/mod-arch-library/bff/internal/integrations/kubernetes"
	k8mocks "github.com/opendatahub-io/mod-arch-library/bff/internal/integrations/kubernetes/k8mocks"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/controller-runtime/pkg/envtest"

	helper "github.com/opendatahub-io/mod-arch-library/bff/internal/helpers"

	"github.com/opendatahub-io/mod-arch-library/bff/internal/config"
	"github.com/opendatahub-io/mod-arch-library/bff/internal/repositories"

	"github.com/julienschmidt/httprouter"
)

const (
	Version         = "1.0.0"
	PathPrefix      = "/mod-arch"
	ApiPathPrefix   = "/api/v1"
	HealthCheckPath = "/healthcheck"
	UserPath        = ApiPathPrefix + "/user"
	NamespacePath   = ApiPathPrefix + "/namespaces"
)

type App struct {
	config                  config.EnvConfig
	logger                  *slog.Logger
	kubernetesClientFactory k8s.KubernetesClientFactory
	repositories            *repositories.Repositories
	//used only on mocked k8s client
	testEnv *envtest.Environment
	// rootCAs used for outbound TLS connections to Client Service
	rootCAs *x509.CertPool
	// bffClientFactory creates clients for inter-BFF communication
	bffClientFactory bffclient.BFFClientFactory
}

func NewApp(cfg config.EnvConfig, logger *slog.Logger) (*App, error) {
	logger.Debug("Initializing app with config", slog.Any("config", cfg))
	var k8sFactory k8s.KubernetesClientFactory
	var err error
	// used only on mocked k8s client
	var testEnv *envtest.Environment
	var rootCAs *x509.CertPool

	// Initialize CA pool if bundle paths are provided
	if len(cfg.BundlePaths) > 0 {
		// Start with system certs if available
		if pool, err := x509.SystemCertPool(); err == nil {
			rootCAs = pool
		} else {
			rootCAs = x509.NewCertPool()
		}
		var loadedAny bool
		for _, p := range cfg.BundlePaths {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			// Read and append each PEM bundle; ignore errors per file, log at debug
			pemBytes, readErr := os.ReadFile(p)
			if readErr != nil {
				logger.Debug("CA bundle not readable, skipping", slog.String("path", p), slog.Any("error", readErr))
				continue
			}
			if ok := rootCAs.AppendCertsFromPEM(pemBytes); !ok {
				logger.Debug("No certs appended from PEM bundle", slog.String("path", p))
				continue
			}
			loadedAny = true
			logger.Info("Added CA bundle", slog.String("path", p))
		}
		if !loadedAny {
			// If none were loaded successfully, keep rootCAs nil to fall back to default transport behavior
			rootCAs = nil
			logger.Warn("No CA certificates loaded from bundle-paths; falling back to system defaults")
		}
	}

	if cfg.MockK8Client {
		//mock all k8s calls with 'env test'
		var clientset kubernetes.Interface
		ctx, cancel := context.WithCancel(context.Background())
		testEnv, clientset, err = k8mocks.SetupEnvTest(k8mocks.TestEnvInput{
			Logger: logger,
			Ctx:    ctx,
			Cancel: cancel,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to setup envtest: %w", err)
		}
		//create mocked kubernetes client factory
		k8sFactory, err = k8mocks.NewMockedKubernetesClientFactory(clientset, testEnv, cfg, logger)

	} else {
		//create kubernetes client factory
		k8sFactory, err = k8s.NewKubernetesClientFactory(cfg, logger)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes client: %w", err)
	}

	// Initialize BFF client factory for inter-BFF communication
	var bffFactory bffclient.BFFClientFactory
	bffConfig := bffclient.NewDefaultBFFClientConfig()
	bffConfig.MockBFFClients = cfg.MockBFFClients
	bffConfig.InsecureSkipVerify = cfg.InsecureSkipVerify

	// Apply target-specific configuration overrides from CLI flags/env vars here.
	// Example: to configure a target BFF, add fields to EnvConfig and apply them:
	//
	//   if targetCfg := bffConfig.GetServiceConfig(bffclient.BFFTargetMaaS); targetCfg != nil {
	//       targetCfg.ServiceName = cfg.BFFTargetServiceName
	//       targetCfg.Port = cfg.BFFTargetServicePort
	//       targetCfg.DevOverrideURL = cfg.BFFTargetDevURL
	//   }

	if cfg.MockBFFClients {
		logger.Info("Using mock BFF client factory")
		bffFactory = bffmocks.NewMockClientFactory(logger)
	} else {
		logger.Info("Using real BFF client factory")
		bffFactory = bffclient.NewRealClientFactory(bffConfig, rootCAs, cfg.InsecureSkipVerify, logger)
	}

	app := &App{
		config:                  cfg,
		logger:                  logger,
		kubernetesClientFactory: k8sFactory,
		repositories:            repositories.NewRepositories(),
		testEnv:                 testEnv,
		rootCAs:                 rootCAs,
		bffClientFactory:        bffFactory,
	}
	return app, nil
}

func (app *App) Shutdown() error {
	app.logger.Info("shutting down app...")
	if app.testEnv == nil {
		return nil
	}
	//shutdown the envtest control plane when we are in the mock mode.
	app.logger.Info("shutting env test...")
	return app.testEnv.Stop()
}

func (app *App) Routes() http.Handler {
	// Router for /api/v1/*
	apiRouter := httprouter.New()

	apiRouter.NotFound = http.HandlerFunc(app.notFoundResponse)
	apiRouter.MethodNotAllowed = http.HandlerFunc(app.methodNotAllowedResponse)

	// Minimal Kubernetes-backed starter endpoints
	apiRouter.GET(UserPath, app.UserHandler)
	apiRouter.GET(NamespacePath, app.GetNamespacesHandler)

	// Unity Catalog proxy
	apiRouter.GET(CatalogsPath, app.CatalogsHandler)
	apiRouter.POST(CatalogsPath, app.CreateCatalogHandler)
	apiRouter.DELETE(CatalogPath, app.DeleteCatalogHandler)
	apiRouter.GET(PermissionsPath, app.GetCatalogPermissionsHandler)
	apiRouter.PATCH(PermissionsPath, app.UpdateCatalogPermissionsHandler)

	// Catalog detail
	apiRouter.GET(CatalogDetailPath, app.CatalogDetailHandler)
	apiRouter.POST(SetCatalogAdminPath, app.SetCatalogAdminHandler)
	apiRouter.POST(CatalogMembersPath, app.AddCatalogMemberHandler)

	// Schemas, tables, volumes
	apiRouter.GET(SchemasPath, app.ListSchemasHandler)
	apiRouter.POST(SchemasPath, app.CreateSchemaHandler)
	apiRouter.DELETE(SchemasPath+"/:schema", app.DeleteSchemaHandler)
	apiRouter.GET(TablesPath, app.ListTablesHandler)
	apiRouter.POST(TablesPath, app.CreateTableHandler)
	apiRouter.DELETE(TablesPath+"/:table", app.DeleteTableHandler)
	apiRouter.GET(VolumesPath, app.ListVolumesHandler)
	apiRouter.POST(VolumesPath, app.CreateVolumeHandler)
	apiRouter.DELETE(VolumesPath+"/:volume", app.DeleteVolumeHandler)

	// Volume provenance (Milvus stats)
	apiRouter.GET(ProvenancePath, app.MilvusStatsHandler)

	// Table version history (Delta stats from Marquez)
	apiRouter.GET(TableVersionsPath, app.TableVersionsHandler)

	// UI config
	apiRouter.GET(ConfigPath, app.ConfigHandler)

	// Permissions management (proxy to UC)
	apiRouter.GET(PermissionsProxyPath, app.GetPermissionsHandler)
	apiRouter.PATCH(PermissionsProxyPath, app.PatchPermissionsHandler)
	apiRouter.POST(PropagateSchemaPath, app.PropagateSchemaHandler)

	// Permission groups (ucg- prefix, separate from catalog groups)
	apiRouter.GET(PermGroupsPath, app.ListPermGroupsHandler)
	apiRouter.POST(PermGroupsPath, app.CreatePermGroupHandler)
	apiRouter.DELETE(PermGroupPath, app.DeletePermGroupHandler)
	apiRouter.PATCH(PermGroupPath, app.PatchPermGroupHandler)

	// App registration
	apiRouter.GET(AppsPath, app.ListAppsHandler)
	apiRouter.POST(AppsPath, app.RegisterAppHandler)
	apiRouter.DELETE(AppPath, app.DeleteAppHandler)

	// MLflow traces proxy
	apiRouter.GET(TracesPath, app.TracesHandler)

	// SCIM user management
	apiRouter.GET(ApiPathPrefix+"/scim/users", app.SCIMUsersHandler)
	apiRouter.POST(ApiPathPrefix+"/scim/users", app.CreateSCIMUserHandler)

	// Admin check
	apiRouter.GET(ApiPathPrefix+"/admin", app.AdminCheckHandler)

	// Metastore
	apiRouter.GET(ApiPathPrefix+"/metastore", app.MetastorePermissionsHandler)

	// OpenShift Groups
	apiRouter.GET(GroupsPath, app.ListGroupsHandler)
	apiRouter.POST(GroupsPath, app.CreateGroupHandler)
	apiRouter.DELETE(GroupPath, app.DeleteGroupHandler)

	// OpenShift Users
	apiRouter.GET(ApiPathPrefix+"/ocp-users", app.ListOCPUsersHandler)

	// API routes — with auth middleware (skips identity injection if X-Auth-Request-User is present)
	authedAPI := app.RecoverPanic(app.EnableTelemetry(app.EnableCORS(app.InjectRequestIdentity(apiRouter))))

	// API routes without strict auth (for federated mode where RHOAI proxy handles auth)
	noAuthAPI := app.RecoverPanic(app.EnableTelemetry(app.EnableCORS(apiRouter)))

	// Static file server — no auth
	staticDir := http.Dir(app.config.StaticAssetsDir)
	fileServer := http.FileServer(staticDir)
	staticHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctxLogger := helper.GetContextLoggerFromReq(r)
		if _, err := staticDir.Open(r.URL.Path); err == nil {
			ctxLogger.Debug("Serving static file", slog.String("path", r.URL.Path))
			fileServer.ServeHTTP(w, r)
			return
		}
		ctxLogger.Debug("Static asset not found, serving index.html", slog.String("path", r.URL.Path))
		http.ServeFile(w, r, path.Join(app.config.StaticAssetsDir, "index.html"))
	})

	// Healthcheck — no auth
	healthcheckRouter := httprouter.New()
	healthcheckRouter.GET(HealthCheckPath, app.HealthcheckHandler)

	// Combined mux: API with auth, static without
	combinedMux := http.NewServeMux()
	combinedMux.Handle(HealthCheckPath, app.RecoverPanic(app.EnableTelemetry(healthcheckRouter)))
	apiHandler := authedAPI
	if os.Getenv("DEPLOYMENT_MODE") == "federated" {
		apiHandler = noAuthAPI
	}
	combinedMux.Handle(ApiPathPrefix+"/", apiHandler)
	combinedMux.Handle(PathPrefix+ApiPathPrefix+"/", http.StripPrefix(PathPrefix, apiHandler))
	combinedMux.Handle("/data-hub"+ApiPathPrefix+"/", http.StripPrefix("/data-hub", apiHandler))
	combinedMux.Handle("/", app.RecoverPanic(app.EnableTelemetry(staticHandler)))

	return combinedMux
}
