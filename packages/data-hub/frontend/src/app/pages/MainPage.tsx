import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Gallery,
  GalleryItem,
  PageSection,
  Spinner,
  Content,
  Label,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { CatalogIcon } from '@patternfly/react-icons';
import CatalogDetailPage from './CatalogDetailPage';

type Catalog = {
  name: string;
  comment: string | null;
  id: string;
  created_at: number;
};

const MainPage: React.FC = () => {
  const [catalogs, setCatalogs] = React.useState<Catalog[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = React.useState<string | null>(null);

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
            <EmptyStateBody>Create your first catalog to get started.</EmptyStateBody>
          </EmptyState>
        ) : (
          <Gallery hasGutter minWidths={{ default: '300px' }}>
            {catalogs.map((catalog) => (
              <GalleryItem key={catalog.id}>
                <Card
                  isFullHeight
                  onClick={() => setSelectedCatalog(catalog.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <CardTitle>
                    <Split hasGutter>
                      <SplitItem isFilled>{catalog.name}</SplitItem>
                      <SplitItem>
                        <Label color="blue">Catalog</Label>
                      </SplitItem>
                    </Split>
                  </CardTitle>
                  <CardBody>
                    <Stack hasGutter>
                      <StackItem>{catalog.comment || 'No description'}</StackItem>
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
    </>
  );
};

export default MainPage;
