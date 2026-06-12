import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  ClipboardCopy,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Flex,
  FlexItem,
  Label,
  List,
  ListItem,
  MenuToggle,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import {
  ExternalLinkAltIcon,
  DatabaseIcon,
  SearchIcon,
  StorageDomainIcon,
} from '@patternfly/react-icons';

type VolumeInfo = {
  name: string;
  volume_type: string;
  storage_location: string;
  comment: string;
};

type MilvusStats = {
  count: number;
  source_docs: string[];
  error?: string;
};

type TraceInfo = {
  trace_id: string;
  timestamp: string;
  status: string;
  duration_ms: number;
  request: string;
  response: string;
  app_name: string;
  source_docs: string[];
};

type RegisteredApp = {
  name: string;
  displayName: string;
  type: string;
  volumes: string[];
};

type VolumeProvenancePageProps = {
  catalogName: string;
  schemaName: string;
  volume: VolumeInfo;
  marquezUrl?: string;
  mlflowUrl?: string;
  mlflowExperimentId?: string;
  mlflowWorkspace?: string;
  onBack: () => void;
};

const API_PREFIX = '/data-hub/api/v1';

const VolumeProvenancePage: React.FC<VolumeProvenancePageProps> = ({
  catalogName,
  schemaName,
  volume,
  marquezUrl = '',
  mlflowUrl = '',
  mlflowExperimentId = '59',
  mlflowWorkspace = 'mstoklus',
  onBack,
}) => {
  const [milvusStats, setMilvusStats] = React.useState<MilvusStats | null>(null);
  const [milvusLoading, setMilvusLoading] = React.useState(true);
  const [traces, setTraces] = React.useState<TraceInfo[]>([]);
  const [tracesLoading, setTracesLoading] = React.useState(true);
  const [linkedApps, setLinkedApps] = React.useState<RegisteredApp[]>([]);
  const [appFilter, setAppFilter] = React.useState('');
  const [appFilterOpen, setAppFilterOpen] = React.useState(false);

  React.useEffect(() => {
    setMilvusLoading(true);
    setTracesLoading(true);

    Promise.all([
      fetch(
        `${API_PREFIX}/catalogs/${catalogName}/schemas/${schemaName}/volumes/${volume.name}/milvus-stats`,
      )
        .then((r) => r.json())
        .catch(() => ({ count: 0, source_docs: [], error: 'Failed to fetch Milvus stats' })),
      fetch(
        `${API_PREFIX}/traces?experiment_id=${mlflowExperimentId}&limit=20`,
      )
        .then((r) => r.json())
        .catch(() => ({ traces: [] })),
      fetch(`${API_PREFIX}/apps`)
        .then((r) => r.json())
        .catch(() => ({ apps: [] })),
    ]).then(([milvusData, tracesData, appsData]) => {
      setMilvusStats(milvusData);
      setMilvusLoading(false);
      setTraces(tracesData.traces || []);
      setTracesLoading(false);
      const fullName = `${catalogName}.${schemaName}.${volume.name}`;
      setLinkedApps(
        (appsData.apps || []).filter((a: RegisteredApp) => a.volumes?.includes(fullName)),
      );
    });
  }, [catalogName, schemaName, volume.name, mlflowExperimentId]);

  const filteredTraces = appFilter
    ? traces.filter((t) => t.app_name === appFilter)
    : traces;

  const appFilterOptions = [...new Set(traces.map((t) => t.app_name).filter(Boolean))];

  const lineageUrl = `${marquezUrl}/lineage/dataset/${catalogName}/${schemaName}.${volume.name}?depth=10`;
  const tracesUrl = `${mlflowUrl}/mlflow/#/experiments/${mlflowExperimentId}/traces?workspace=${mlflowWorkspace}`;

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem>
            <Button variant="link" onClick={onBack}>
              {schemaName}
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{volume.name} &mdash; Provenance</BreadcrumbItem>
        </Breadcrumb>
        <Stack hasGutter>
          <StackItem>
            <Split hasGutter>
              <SplitItem isFilled>
                <Content component="h1">{volume.name}</Content>
              </SplitItem>
              <SplitItem>
                <Label color="green" isCompact>
                  {volume.volume_type}
                </Label>
              </SplitItem>
              <SplitItem>
                <Label color="purple" isCompact>
                  Provenance
                </Label>
              </SplitItem>
            </Split>
          </StackItem>
          {volume.comment ? (
            <StackItem>
              <Content component="p">{volume.comment}</Content>
            </StackItem>
          ) : null}
        </Stack>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          {/* Volume Metadata */}
          <StackItem>
            <Card>
              <CardTitle>
                <StorageDomainIcon /> Volume Metadata
              </CardTitle>
              <CardBody>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Full name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <ClipboardCopy isReadOnly variant="inline-compact">
                        {catalogName}.{schemaName}.{volume.name}
                      </ClipboardCopy>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Volume type</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label color="green" isCompact>
                        {volume.volume_type}
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  {volume.storage_location ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Storage location</DescriptionListTerm>
                      <DescriptionListDescription>
                        <ClipboardCopy isReadOnly variant="inline-compact">
                          {volume.storage_location}
                        </ClipboardCopy>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}
                </DescriptionList>
              </CardBody>
            </Card>
          </StackItem>

          {/* Marquez Lineage */}
          <StackItem>
            <Card>
              <CardTitle>
                <DatabaseIcon /> Data Lineage
              </CardTitle>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    <Content component="p">
                      Track how data flows through the pipeline &mdash; from ingestion to embedding.
                      View upstream sources and downstream consumers in the Marquez lineage graph.
                    </Content>
                  </StackItem>
                  <StackItem>
                    <Button
                      variant="secondary"
                      icon={<ExternalLinkAltIcon />}
                      component="a"
                      href={lineageUrl}
                      target="_blank"
                    >
                      Open Lineage Graph
                    </Button>
                  </StackItem>
                </Stack>
              </CardBody>
            </Card>
          </StackItem>

          {/* Linked Apps */}
          {linkedApps.length > 0 ? (
            <StackItem>
              <Card>
                <CardTitle>
                  <SearchIcon /> Linked Applications
                </CardTitle>
                <CardBody>
                  <Flex>
                    {linkedApps.map((a) => (
                      <FlexItem key={a.name}>
                        <Label color={a.type === 'deterministic' ? 'blue' : 'purple'} isCompact>
                          {a.displayName || a.name} ({a.type})
                        </Label>
                      </FlexItem>
                    ))}
                  </Flex>
                </CardBody>
              </Card>
            </StackItem>
          ) : null}

          {/* Query Traces (inline) */}
          <StackItem>
            <Card>
              <CardTitle>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <SearchIcon /> Recent Query Traces
                  </SplitItem>
                  <SplitItem>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                      {appFilterOptions.length > 1 ? (
                        <FlexItem>
                          <Select
                            id="trace-app-filter"
                            isOpen={appFilterOpen}
                            selected={appFilter}
                            onSelect={(_e, val) => {
                              setAppFilter(val as string);
                              setAppFilterOpen(false);
                            }}
                            onOpenChange={setAppFilterOpen}
                            toggle={(toggleRef) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() => setAppFilterOpen(!appFilterOpen)}
                                isExpanded={appFilterOpen}
                                isCompact
                              >
                                {appFilter || 'All apps'}
                              </MenuToggle>
                            )}
                          >
                            <SelectList>
                              <SelectOption value="">All apps</SelectOption>
                              {appFilterOptions.map((a) => (
                                <SelectOption key={a} value={a}>
                                  {a}
                                </SelectOption>
                              ))}
                            </SelectList>
                          </Select>
                        </FlexItem>
                      ) : null}
                      <FlexItem>
                        <Button
                          variant="link"
                          icon={<ExternalLinkAltIcon />}
                          component="a"
                          href={tracesUrl}
                          target="_blank"
                        >
                          View all in MLflow
                        </Button>
                      </FlexItem>
                    </Flex>
                  </SplitItem>
                </Split>
              </CardTitle>
              <CardBody>
                {tracesLoading ? (
                  <Spinner aria-label="Loading traces" size="lg" />
                ) : filteredTraces.length === 0 ? (
                  <EmptyState
                    headingLevel="h3"
                    titleText="No traces found"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>
                      No RAG query traces referencing this volume yet.
                    </EmptyStateBody>
                  </EmptyState>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <Stack hasGutter>
                    {filteredTraces.map((t) => (
                      <StackItem key={t.trace_id}>
                        <Card isCompact>
                          <CardBody>
                            <DescriptionList isHorizontal isCompact>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Query</DescriptionListTerm>
                                <DescriptionListDescription>
                                  {t.request}
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>App</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <Label
                                    color={t.app_name ? 'blue' : 'grey'}
                                    isCompact
                                  >
                                    {t.app_name || 'unknown'}
                                  </Label>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Duration</DescriptionListTerm>
                                <DescriptionListDescription>
                                  {t.duration_ms > 0
                                    ? `${(t.duration_ms / 1000).toFixed(1)}s`
                                    : '—'}
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Status</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <Label
                                    color={t.status === 'OK' ? 'green' : 'orange'}
                                    isCompact
                                  >
                                    {t.status}
                                  </Label>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            </DescriptionList>
                          </CardBody>
                        </Card>
                      </StackItem>
                    ))}
                  </Stack>
                  </div>
                )}
              </CardBody>
            </Card>
          </StackItem>

          {/* Milvus Vector Stats */}
          <StackItem>
            <Card>
              <CardTitle>
                <DatabaseIcon /> Vector Store Stats (Milvus)
              </CardTitle>
              <CardBody>
                {milvusLoading ? (
                  <Spinner aria-label="Loading Milvus stats" size="lg" />
                ) : milvusStats?.error ? (
                  <EmptyState
                    headingLevel="h3"
                    titleText="Milvus unavailable"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>{milvusStats.error}</EmptyStateBody>
                  </EmptyState>
                ) : milvusStats && milvusStats.count > 0 ? (
                  <Stack hasGutter>
                    <StackItem>
                      <DescriptionList isHorizontal>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Indexed chunks</DescriptionListTerm>
                          <DescriptionListDescription>
                            <Label color="blue" isCompact>
                              {milvusStats.count}
                            </Label>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Source documents</DescriptionListTerm>
                          <DescriptionListDescription>
                            <Label color="blue" isCompact>
                              {milvusStats.source_docs.length}
                            </Label>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      </DescriptionList>
                    </StackItem>
                    {milvusStats.source_docs.length > 0 ? (
                      <StackItem>
                        <Content component="h4">Source documents</Content>
                        <List>
                          {milvusStats.source_docs.map((doc) => (
                            <ListItem key={doc}>{doc}</ListItem>
                          ))}
                        </List>
                      </StackItem>
                    ) : null}
                  </Stack>
                ) : (
                  <EmptyState
                    headingLevel="h3"
                    titleText="No vectors found"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>
                      No document chunks from this volume have been indexed in Milvus yet.
                    </EmptyStateBody>
                  </EmptyState>
                )}
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      </PageSection>
    </>
  );
};

export default VolumeProvenancePage;
