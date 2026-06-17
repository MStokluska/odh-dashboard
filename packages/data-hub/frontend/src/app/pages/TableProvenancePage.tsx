import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
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
  MenuToggle,
  PageSection,
  SearchInput,
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
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  ExpandableRowContent,
} from '@patternfly/react-table';
import { ExternalLinkAltIcon, SearchIcon } from '@patternfly/react-icons';

type FileChanged = {
  filename: string;
  action: string;
  lob?: string;
  size_bytes?: number;
  old_size?: number;
  new_size?: number;
};

type DeltaStats = {
  deltaVersion: number;
  totalRows: number;
  rowsAdded: number;
  rowsSuperseded: number;
  operation: string;
  filesChanged?: FileChanged[];
};

type TableVersion = {
  version: string;
  createdAt: string;
  datasetVersion?: string;
  deltaStats?: DeltaStats;
};

type TraceInfo = {
  trace_id: string;
  timestamp: string;
  status: string;
  duration_ms: number;
  request: string;
  app_name: string;
};

type RegisteredApp = {
  name: string;
  mlflowExperimentId?: string;
  mlflowWorkspace?: string;
};

type TableProvenancePageProps = {
  catalogName: string;
  schemaName: string;
  tableName: string;
  tableFormat: string;
  marquezUrl: string;
  mlflowUrl?: string;
  onBack: () => void;
};

const API_PREFIX = '/data-hub/api/v1';

const TableProvenancePage: React.FC<TableProvenancePageProps> = ({
  catalogName,
  schemaName,
  tableName,
  tableFormat,
  marquezUrl,
  mlflowUrl = '',
  onBack,
}) => {
  const [versions, setVersions] = React.useState<TableVersion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());
  const [fileSearch, setFileSearch] = React.useState('');
  const [traces, setTraces] = React.useState<TraceInfo[]>([]);
  const [tracesLoading, setTracesLoading] = React.useState(true);
  const [appFilter, setAppFilter] = React.useState('');
  const [appFilterOpen, setAppFilterOpen] = React.useState(false);
  const [tracesUrl, setTracesUrl] = React.useState('');

  React.useEffect(() => {
    const fetchVersions = async () => {
      try {
        const resp = await fetch(
          `${API_PREFIX}/catalogs/${catalogName}/schemas/${schemaName}/tables/${tableName}/versions`,
        );
        if (!resp.ok) {
          throw new Error(`${resp.status} ${resp.statusText}`);
        }
        const data = await resp.json();
        setVersions(data.versions || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load versions');
      } finally {
        setLoading(false);
      }
    };
    fetchVersions();

    fetch(`${API_PREFIX}/apps`)
      .then((r) => r.json())
      .then((appsData) => {
        const allApps: RegisteredApp[] = appsData.apps || [];
        const firstApp = allApps[0];
        const experimentId = firstApp?.mlflowExperimentId;
        if (experimentId) {
          const ws = firstApp?.mlflowWorkspace || '';
          setTracesUrl(
            `${mlflowUrl}/mlflow/#/experiments/${experimentId}/traces${ws ? `?workspace=${ws}` : ''}`,
          );
          fetch(`${API_PREFIX}/traces?experiment_id=${experimentId}&limit=20`)
            .then((r) => r.json())
            .then((data) => {
              setTraces(data.traces || []);
              setTracesLoading(false);
            })
            .catch(() => setTracesLoading(false));
        } else {
          setTracesLoading(false);
        }
      })
      .catch(() => setTracesLoading(false));
  }, [catalogName, schemaName, tableName, mlflowUrl]);

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const actionColor = (action: string) => {
    if (action === 'added') {
      return 'green';
    }
    if (action === 'superseded') {
      return 'orange';
    }
    return 'grey';
  };

  type FileRecord = {
    filename: string;
    lob: string;
    currentStatus: string;
    history: { action: string; version: number; timestamp: string; size?: number }[];
  };

  const fileIndex = React.useMemo(() => {
    const index = new Map<string, FileRecord>();
    const sortedVersions = [...versions].reverse();
    for (const v of sortedVersions) {
      const ds = v.deltaStats;
      if (!ds?.filesChanged) {
        continue;
      }
      for (const f of ds.filesChanged) {
        const existing = index.get(f.filename);
        const entry = {
          action: f.action,
          version: ds.deltaVersion,
          timestamp: v.createdAt,
          size: f.size_bytes ?? f.new_size,
        };
        if (existing) {
          existing.history.push(entry);
          existing.currentStatus = f.action === 'superseded' ? 'superseded' : 'current';
        } else {
          index.set(f.filename, {
            filename: f.filename,
            lob: f.lob ?? '',
            currentStatus: f.action === 'superseded' ? 'superseded' : 'current',
            history: [entry],
          });
        }
      }
    }
    return Array.from(index.values());
  }, [versions]);

  const filteredFiles = React.useMemo(() => {
    if (!fileSearch) {
      return fileIndex;
    }
    const q = fileSearch.toLowerCase();
    return fileIndex.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.lob.toLowerCase().includes(q) ||
        f.currentStatus.toLowerCase().includes(q),
    );
  }, [fileIndex, fileSearch]);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem>
            <Button variant="link" onClick={onBack}>
              {catalogName}.{schemaName}
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{tableName}</BreadcrumbItem>
        </Breadcrumb>
        <Split hasGutter>
          <SplitItem isFilled>
            <Content component="h1">{tableName}</Content>
          </SplitItem>
          <SplitItem>
            <Label color="orange" isCompact>
              {tableFormat}
            </Label>
          </SplitItem>
          <SplitItem>
            <Button
              variant="secondary"
              icon={<ExternalLinkAltIcon />}
              component="a"
              href={`${marquezUrl}/lineage/dataset/${catalogName}/${schemaName}.${tableName}?depth=5`}
              target="_blank"
            >
              View in Marquez
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <Card>
              <CardTitle>Delta Version History</CardTitle>
              <CardBody>
                {loading ? (
                  <Spinner size="lg" />
                ) : error ? (
                  <EmptyState
                    headingLevel="h3"
                    titleText="Failed to load versions"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>{error}</EmptyStateBody>
                  </EmptyState>
                ) : versions.length === 0 ? (
                  <EmptyState
                    headingLevel="h3"
                    titleText="No version history"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>
                      Run the document registry pipeline to create version history.
                    </EmptyStateBody>
                  </EmptyState>
                ) : (
                  <Table aria-label="Delta version history" variant="compact">
                    <Thead>
                      <Tr>
                        <Th />
                        <Th>Delta Version</Th>
                        <Th>Operation</Th>
                        <Th>Total Rows</Th>
                        <Th>Added</Th>
                        <Th>Superseded</Th>
                        <Th>Timestamp</Th>
                      </Tr>
                    </Thead>
                    {versions.map((v, idx) => {
                      const ds = v.deltaStats;
                      const isExpanded = expandedRows.has(idx);
                      const hasFiles = ds?.filesChanged && ds.filesChanged.length > 0;
                      return (
                        <Tbody key={v.version} isExpanded={isExpanded}>
                          <Tr>
                            <Td
                              expand={
                                hasFiles
                                  ? {
                                      rowIndex: idx,
                                      isExpanded,
                                      onToggle: () => toggleRow(idx),
                                    }
                                  : undefined
                              }
                            />
                            <Td>
                              <Label color="blue" isCompact>
                                v{ds?.deltaVersion ?? v.datasetVersion ?? '?'}
                              </Label>
                            </Td>
                            <Td>
                              <Label
                                color={
                                  ds?.operation === 'CREATE'
                                    ? 'green'
                                    : ds?.operation === 'APPEND'
                                      ? 'blue'
                                      : 'grey'
                                }
                                isCompact
                              >
                                {ds?.operation ?? '—'}
                              </Label>
                            </Td>
                            <Td>{ds?.totalRows ?? '—'}</Td>
                            <Td>
                              {ds?.rowsAdded ? (
                                <Label color="green" isCompact>
                                  +{ds.rowsAdded}
                                </Label>
                              ) : (
                                '—'
                              )}
                            </Td>
                            <Td>
                              {ds?.rowsSuperseded ? (
                                <Label color="orange" isCompact>
                                  ~{ds.rowsSuperseded}
                                </Label>
                              ) : (
                                '—'
                              )}
                            </Td>
                            <Td>{new Date(v.createdAt).toLocaleString()}</Td>
                          </Tr>
                          {hasFiles ? (
                            <Tr isExpanded={isExpanded}>
                              <Td colSpan={7}>
                                <ExpandableRowContent>
                                  <Content component="h4">Files changed</Content>
                                  <DescriptionList
                                    isHorizontal
                                    columnModifier={{ default: '2Col' }}
                                  >
                                    {ds!.filesChanged!.map((f) => (
                                      <DescriptionListGroup key={f.filename + f.action}>
                                        <DescriptionListTerm>
                                          <Label color={actionColor(f.action)} isCompact>
                                            {f.action}
                                          </Label>{' '}
                                          {f.filename}
                                        </DescriptionListTerm>
                                        <DescriptionListDescription>
                                          {f.lob ? `LOB: ${f.lob}` : ''}
                                          {f.size_bytes ? ` | ${f.size_bytes} bytes` : ''}
                                          {f.old_size
                                            ? ` | ${f.old_size} → ${f.new_size} bytes`
                                            : ''}
                                        </DescriptionListDescription>
                                      </DescriptionListGroup>
                                    ))}
                                  </DescriptionList>
                                </ExpandableRowContent>
                              </Td>
                            </Tr>
                          ) : null}
                        </Tbody>
                      );
                    })}
                  </Table>
                )}
              </CardBody>
            </Card>
          </StackItem>

          {fileIndex.length > 0 ? (
            <StackItem>
              <Card>
                <CardTitle>
                  <Split hasGutter>
                    <SplitItem isFilled>File Search ({fileIndex.length} files)</SplitItem>
                    <SplitItem>
                      <SearchInput
                        placeholder="Search by filename, LOB, or status..."
                        value={fileSearch}
                        onChange={(_e, val) => setFileSearch(val)}
                        onClear={() => setFileSearch('')}
                        aria-label="Search files"
                      />
                    </SplitItem>
                  </Split>
                </CardTitle>
                <CardBody>
                  <Table aria-label="File index" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Filename</Th>
                        <Th>LOB</Th>
                        <Th>Status</Th>
                        <Th>History</Th>
                        <Th>Lineage</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredFiles.map((f) => (
                        <Tr key={f.filename}>
                          <Td dataLabel="Filename">{f.filename}</Td>
                          <Td dataLabel="LOB">
                            <Label isCompact color="cyan">
                              {f.lob || 'unknown'}
                            </Label>
                          </Td>
                          <Td dataLabel="Status">
                            <Label
                              isCompact
                              color={f.currentStatus === 'current' ? 'green' : 'orange'}
                            >
                              {f.currentStatus}
                            </Label>
                          </Td>
                          <Td dataLabel="History">
                            {f.history.map((h) => (
                              <Label
                                key={`${h.version}-${h.action}`}
                                isCompact
                                color={actionColor(h.action)}
                                className="pf-v6-u-mr-xs"
                              >
                                v{h.version}: {h.action}
                              </Label>
                            ))}
                          </Td>
                          <Td dataLabel="Lineage">
                            <Button
                              variant="link"
                              isInline
                              icon={<ExternalLinkAltIcon />}
                              component="a"
                              href={`${marquezUrl}/lineage/dataset/${catalogName}/${schemaName}.${tableName}?depth=5`}
                              target="_blank"
                            >
                              Marquez
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </StackItem>
          ) : null}

          <StackItem>
            <Card>
              <CardTitle>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <SearchIcon /> Recent Query Traces
                  </SplitItem>
                  <SplitItem>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                      {[...new Set(traces.map((t) => t.app_name).filter(Boolean))].length > 1 ? (
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
                              {[...new Set(traces.map((t) => t.app_name).filter(Boolean))].map(
                                (a) => (
                                  <SelectOption key={a} value={a}>
                                    {a}
                                  </SelectOption>
                                ),
                              )}
                            </SelectList>
                          </Select>
                        </FlexItem>
                      ) : null}
                      {tracesUrl ? (
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
                      ) : null}
                    </Flex>
                  </SplitItem>
                </Split>
              </CardTitle>
              <CardBody>
                {tracesLoading ? (
                  <Spinner aria-label="Loading traces" size="lg" />
                ) : (appFilter ? traces.filter((t) => t.app_name === appFilter) : traces)
                    .length === 0 ? (
                  <EmptyState
                    headingLevel="h3"
                    titleText="No traces found"
                    variant={EmptyStateVariant.sm}
                  >
                    <EmptyStateBody>
                      No RAG query traces for this table yet.
                    </EmptyStateBody>
                  </EmptyState>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <Stack hasGutter>
                      {(appFilter
                        ? traces.filter((t) => t.app_name === appFilter)
                        : traces
                      ).map((t) => (
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
                                    <Label color={t.app_name ? 'blue' : 'grey'} isCompact>
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
        </Stack>
      </PageSection>
    </>
  );
};

export default TableProvenancePage;
