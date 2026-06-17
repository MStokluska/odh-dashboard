import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Form,
  FormGroup,
  Gallery,
  GalleryItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Spinner,
  Content,
  Label,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { CatalogIcon, CogIcon, PlusCircleIcon, TrashIcon } from '@patternfly/react-icons';
import CatalogDetailPage from './CatalogDetailPage';

type Catalog = {
  name: string;
  comment: string | null;
  owner: string | null;
  id: string;
  created_at: number;
};

const MainPage: React.FC = () => {
  const [catalogs, setCatalogs] = React.useState<Catalog[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [showCreateCatalog, setShowCreateCatalog] = React.useState(false);
  const [newCatalogName, setNewCatalogName] = React.useState('');
  const [newCatalogComment, setNewCatalogComment] = React.useState('');

  React.useEffect(() => {
    fetch('/data-hub/api/v1/admin')
      .then((r) => r.json())
      .then((data) => setIsAdmin(data.isAdmin === true))
      .catch(() => {});
  }, []);

  const handleCreateCatalog = () => {
    fetch('/data-hub/api/v1/catalogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatalogName, comment: newCatalogComment }),
    }).then(() => {
      setShowCreateCatalog(false);
      setNewCatalogName('');
      setNewCatalogComment('');
      fetchCatalogs();
    });
  };

  const fetchCatalogs = React.useCallback(() => {
    setLoaded(false);
    fetch('/data-hub/api/v1/catalogs')
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status} ${r.statusText}`);
        }
        return r.json();
      })
      .then((data) => {
        setCatalogs(data.catalogs || []);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);

  React.useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  if (selectedCatalog) {
    return (
      <CatalogDetailPage
        catalogName={selectedCatalog}
        onBack={() => setSelectedCatalog(null)}
      />
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Stack hasGutter>
              <StackItem>
                <Content component="h1">Data Hub</Content>
              </StackItem>
              <StackItem>
                <Content component="p">Browse and manage Unity Catalog data assets</Content>
              </StackItem>
            </Stack>
          </SplitItem>
          {isAdmin ? (
            <SplitItem>
              <Stack hasGutter>
                <StackItem>
                  <Button
                    variant="primary"
                    icon={<PlusCircleIcon />}
                    onClick={() => setShowCreateCatalog(true)}
                  >
                    Create catalog
                  </Button>
                </StackItem>
                <StackItem>
                  <Button variant="secondary" icon={<CogIcon />} component="a" href="/data-hub/permissions">
                    Manage permissions
                  </Button>
                </StackItem>
                <StackItem>
                  <Button variant="secondary" component="a" href="/data-hub/apps">
                    Registered apps
                  </Button>
                </StackItem>
              </Stack>
            </SplitItem>
          ) : null}
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        {!loaded ? (
          <Spinner aria-label="Loading catalogs" />
        ) : error ? (
          <EmptyState
            headingLevel="h2"
            titleText="Unable to load catalogs"
            variant={EmptyStateVariant.lg}
            icon={CatalogIcon}
          >
            <EmptyStateBody>{error}</EmptyStateBody>
            <Button variant="primary" onClick={() => { setError(null); fetchCatalogs(); }}>
              Retry
            </Button>
          </EmptyState>
        ) : catalogs.length === 0 ? (
          <EmptyState
            headingLevel="h2"
            titleText="No catalogs found"
            variant={EmptyStateVariant.lg}
            icon={CatalogIcon}
          >
            <EmptyStateBody>
              {isAdmin
                ? 'Create your first catalog to get started.'
                : 'No catalogs are available. Ask a UC admin to grant you access.'}
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Gallery hasGutter minWidths={{ default: '300px' }}>
            {catalogs.map((catalog) => (
              <GalleryItem key={catalog.id}>
                <Card isFullHeight>
                  <CardTitle>
                    <Split hasGutter>
                      <SplitItem
                        isFilled
                        onClick={() => setSelectedCatalog(catalog.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        {catalog.name}
                      </SplitItem>
                      <SplitItem>
                        <Label color="blue">Catalog</Label>
                      </SplitItem>
                      {isAdmin ? (
                        <SplitItem>
                          <Button
                            variant="plain"
                            aria-label={`Delete catalog ${catalog.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete catalog "${catalog.name}" and all its contents?`)) {
                                fetch(`/data-hub/api/v1/catalogs/${catalog.name}`, { method: 'DELETE' })
                                  .then(() => fetchCatalogs());
                              }
                            }}
                          >
                            <TrashIcon />
                          </Button>
                        </SplitItem>
                      ) : null}
                    </Split>
                  </CardTitle>
                  <CardBody
                    onClick={() => setSelectedCatalog(catalog.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Stack hasGutter>
                      <StackItem>{catalog.comment || 'No description'}</StackItem>
                      {catalog.owner && catalog.owner !== 'admin' ? (
                        <StackItem>
                          <Content component="small">Owner: {catalog.owner}</Content>
                        </StackItem>
                      ) : null}
                      <StackItem>
                        <Content component="small">
                          Created: {new Date(catalog.created_at).toLocaleDateString()}
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardBody>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        )}
      </PageSection>
      {showCreateCatalog ? (
        <Modal isOpen onClose={() => setShowCreateCatalog(false)} variant="small">
          <ModalHeader title="Create Catalog" />
          <ModalBody>
            <Form>
              <FormGroup label="Name" isRequired fieldId="catalog-name">
                <TextInput id="catalog-name" value={newCatalogName} onChange={(_e, v) => setNewCatalogName(v)} placeholder="e.g. underwriting" />
              </FormGroup>
              <FormGroup label="Description" fieldId="catalog-comment">
                <TextInput id="catalog-comment" value={newCatalogComment} onChange={(_e, v) => setNewCatalogComment(v)} placeholder="Optional description" />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleCreateCatalog} isDisabled={!newCatalogName}>Create</Button>
            <Button variant="link" onClick={() => setShowCreateCatalog(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default MainPage;
