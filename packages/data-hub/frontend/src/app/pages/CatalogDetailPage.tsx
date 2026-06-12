import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Gallery,
  GalleryItem,
  Label,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { CatalogIcon, PlusCircleIcon } from '@patternfly/react-icons';
import SchemaDetailPage from './SchemaDetailPage';

const API_PREFIX = '/data-hub/api/v1';

type ColumnInfo = {
  name: string;
  type_name: string;
  comment: string;
  position: number;
};

type TableInfo = {
  name: string;
  data_source_format: string;
  table_type: string;
  storage_location: string;
  comment: string;
  columns: ColumnInfo[] | null;
};

type VolumeInfo = {
  name: string;
  volume_type: string;
  storage_location: string;
  comment: string;
};

type SchemaInfo = {
  name: string;
  comment: string;
  tables: TableInfo[] | null;
  volumes: VolumeInfo[] | null;
};

type CatalogDetailData = {
  name: string;
  schemas: SchemaInfo[] | null;
  members: unknown[] | null;
};

type CatalogDetailPageProps = {
  catalogName: string;
  onBack: () => void;
};

const CatalogDetailPage: React.FC<CatalogDetailPageProps> = ({ catalogName, onBack }) => {
  const [detail, setDetail] = React.useState<CatalogDetailData | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = React.useState<SchemaInfo | null>(null);

  const [showCreateSchema, setShowCreateSchema] = React.useState(false);
  const [newSchemaName, setNewSchemaName] = React.useState('');
  const [newSchemaComment, setNewSchemaComment] = React.useState('');
  const [creatingSchema, setCreatingSchema] = React.useState(false);

  const [showCreateTable, setShowCreateTable] = React.useState(false);
  const [newTableSchema, setNewTableSchema] = React.useState('');
  const [newTableName, setNewTableName] = React.useState('');
  const [newTableColumns, setNewTableColumns] = React.useState('');
  const [creatingTable, setCreatingTable] = React.useState(false);

  const [showCreateVolume, setShowCreateVolume] = React.useState(false);
  const [newVolumeName, setNewVolumeName] = React.useState('');
  const [newVolumeSchema, setNewVolumeSchema] = React.useState('');
  const [creatingVolume, setCreatingVolume] = React.useState(false);

  const [uiConfig, setUiConfig] = React.useState<{
    marquezUrl: string;
    mlflowUrl: string;
    mlflowExperimentId: string;
    mlflowWorkspace: string;
  } | null>(null);

  React.useEffect(() => {
    fetch(`${API_PREFIX}/config`)
      .then((r) => r.json())
      .then(setUiConfig)
      .catch(() => {});
  }, []);

  const fetchDetail = React.useCallback(() => {
    setLoaded(false);
    fetch(`${API_PREFIX}/catalogs/${catalogName}/detail`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status} ${r.statusText}`);
        }
        return r.json();
      })
      .then((data) => {
        setDetail(data);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, [catalogName]);

  React.useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleCreateSchema = () => {
    setCreatingSchema(true);
    fetch(`${API_PREFIX}/catalogs/${catalogName}/schemas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSchemaName,
        catalog_name: catalogName,
        comment: newSchemaComment,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((d) => { throw new Error(d.message || r.statusText); });
        }
        return r.json();
      })
      .then(() => {
        setShowCreateSchema(false);
        setNewSchemaName('');
        setNewSchemaComment('');
        fetchDetail();
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreatingSchema(false));
  };

  const handleCreateTable = () => {
    setCreatingTable(true);
    const typeMap: Record<string, string> = {
      int: 'INT', integer: 'INT', long: 'LONG', string: 'STRING',
      double: 'DOUBLE', float: 'FLOAT', boolean: 'BOOLEAN',
      date: 'DATE', timestamp: 'TIMESTAMP',
    };
    const columns = newTableColumns.split(',').map((col, idx) => {
      const parts = col.trim().split(' ');
      const colName = parts[0];
      const colType = (parts[1] || 'string').toLowerCase();
      const typeName = typeMap[colType] || 'STRING';
      return {
        name: colName, type_text: colType, type_name: typeName,
        type_json: JSON.stringify({ type: colType }),
        position: idx, nullable: true, type_precision: 0, type_scale: 0,
      };
    });
    fetch(`${API_PREFIX}/catalogs/${catalogName}/schemas/${newTableSchema}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTableName, catalog_name: catalogName, schema_name: newTableSchema,
        table_type: 'EXTERNAL', data_source_format: 'DELTA',
        storage_location: `/tmp/uc/${catalogName}/${newTableSchema}/${newTableName}`,
        columns,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((d) => { throw new Error(d.message || r.statusText); });
        }
        return r.json();
      })
      .then(() => {
        setShowCreateTable(false);
        setNewTableName('');
        setNewTableColumns('');
        setNewTableSchema('');
        fetchDetail();
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreatingTable(false));
  };

  const handleCreateVolume = () => {
    setCreatingVolume(true);
    fetch(`${API_PREFIX}/catalogs/${catalogName}/schemas/${newVolumeSchema}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newVolumeName, catalog_name: catalogName, schema_name: newVolumeSchema,
        volume_type: 'EXTERNAL',
        storage_location: `/tmp/uc/${catalogName}/${newVolumeSchema}/volumes/${newVolumeName}`,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((d) => { throw new Error(d.message || r.statusText); });
        }
        return r.json();
      })
      .then(() => {
        setShowCreateVolume(false);
        setNewVolumeName('');
        setNewVolumeSchema('');
        fetchDetail();
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreatingVolume(false));
  };

  if (!loaded) {
    return <PageSection hasBodyWrapper={false}><Spinner aria-label="Loading" /></PageSection>;
  }

  if (selectedSchema) {
    return (
      <SchemaDetailPage
        catalogName={catalogName}
        schema={selectedSchema}
        onBack={() => setSelectedSchema(null)}
        marquezUrl={uiConfig?.marquezUrl}
        mlflowUrl={uiConfig?.mlflowUrl}
        mlflowExperimentId={uiConfig?.mlflowExperimentId}
        mlflowWorkspace={uiConfig?.mlflowWorkspace}
      />
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem>
            <Button variant="link" onClick={onBack}>Data Hub</Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{catalogName}</BreadcrumbItem>
        </Breadcrumb>
        <Split hasGutter>
          <SplitItem isFilled>
            <Content component="h1">{catalogName}</Content>
          </SplitItem>
          <SplitItem>
            <Button
              variant="secondary"
              component="a"
              href={`${uiConfig?.marquezUrl || ''}/lineage/dataset/${catalogName}/${detail?.schemas?.[0]?.tables?.[0]?.name ? detail.schemas[0].name + '.' + detail.schemas[0].tables[0].name : detail?.schemas?.[0]?.volumes?.[0]?.name ? detail.schemas[0].name + '.' + detail.schemas[0].volumes[0].name : 'default'}?depth=20&isFull=true`}
              target="_blank"
            >
              View all lineage
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      {error ? (
        <PageSection hasBodyWrapper={false}>
          <EmptyState headingLevel="h2" titleText="Error" variant={EmptyStateVariant.lg}>
            <EmptyStateBody>{error}</EmptyStateBody>
            <Button variant="link" onClick={() => setError(null)}>Dismiss</Button>
          </EmptyState>
        </PageSection>
      ) : null}

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <Flex>
              <FlexItem>
                <Content component="h2">Schemas</Content>
              </FlexItem>
              <FlexItem align={{ default: 'alignRight' }}>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setShowCreateSchema(true)}>
                  Create schema
                </Button>
              </FlexItem>
            </Flex>
          </StackItem>
          <StackItem>
            {!detail?.schemas || detail.schemas.length === 0 ? (
              <EmptyState headingLevel="h3" icon={CatalogIcon} titleText="No schemas" variant={EmptyStateVariant.sm}>
                <EmptyStateBody>Create a schema to organize tables and volumes.</EmptyStateBody>
              </EmptyState>
            ) : (
              <Gallery hasGutter minWidths={{ default: '300px' }}>
                {detail.schemas.map((s) => (
                  <GalleryItem key={s.name}>
                    <Card isFullHeight onClick={() => setSelectedSchema(s)} style={{ cursor: 'pointer' }}>
                      <CardTitle>
                        <Split hasGutter>
                          <SplitItem isFilled>{s.name}</SplitItem>
                          <SplitItem>
                            <Button
                              variant="link"
                              size="sm"
                              component="a"
                              href={`${uiConfig?.marquezUrl || ''}/lineage/dataset/${catalogName}/${s.name}.parsed_chunks?depth=6`}
                              target="_blank"
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              Lineage
                            </Button>
                          </SplitItem>
                          <SplitItem><Label color="cyan">Schema</Label></SplitItem>
                        </Split>
                      </CardTitle>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>{s.comment || 'No description'}</StackItem>
                          {s.tables && s.tables.length > 0 ? (
                            <StackItem>
                              <Content component="small"><strong>Tables:</strong> {s.tables.map((t) => t.name).join(', ')}</Content>
                            </StackItem>
                          ) : null}
                          {s.volumes && s.volumes.length > 0 ? (
                            <StackItem>
                              <Content component="small"><strong>Volumes:</strong> {s.volumes.map((v) => v.name).join(', ')}</Content>
                            </StackItem>
                          ) : null}
                        </Stack>
                      </CardBody>
                    </Card>
                  </GalleryItem>
                ))}
              </Gallery>
            )}
          </StackItem>
        </Stack>
      </PageSection>

      {showCreateSchema ? (
        <Modal isOpen onClose={() => setShowCreateSchema(false)} variant="small">
          <ModalHeader title="Create Schema" />
          <ModalBody>
            <Form>
              <FormGroup label="Schema name" isRequired fieldId="schema-name">
                <TextInput id="schema-name" value={newSchemaName} onChange={(_e, v) => setNewSchemaName(v)} isRequired />
              </FormGroup>
              <FormGroup label="Description" fieldId="schema-comment">
                <TextInput id="schema-comment" value={newSchemaComment} onChange={(_e, v) => setNewSchemaComment(v)} />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleCreateSchema} isDisabled={!newSchemaName || creatingSchema} isLoading={creatingSchema}>Create</Button>
            <Button variant="link" onClick={() => setShowCreateSchema(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {showCreateTable ? (
        <Modal isOpen onClose={() => setShowCreateTable(false)} variant="small">
          <ModalHeader title={`Create Table in ${newTableSchema}`} />
          <ModalBody>
            <Form>
              <FormGroup label="Table name" isRequired fieldId="table-name">
                <TextInput id="table-name" value={newTableName} onChange={(_e, v) => setNewTableName(v)} isRequired />
              </FormGroup>
              <FormGroup label="Columns" isRequired fieldId="table-columns" helperText="Comma-separated: name type, e.g. 'id int, name string'">
                <TextInput id="table-columns" value={newTableColumns} onChange={(_e, v) => setNewTableColumns(v)} placeholder="id int, name string, score double" isRequired />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleCreateTable} isDisabled={!newTableName || !newTableColumns || creatingTable} isLoading={creatingTable}>Create</Button>
            <Button variant="link" onClick={() => setShowCreateTable(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {showCreateVolume ? (
        <Modal isOpen onClose={() => setShowCreateVolume(false)} variant="small">
          <ModalHeader title={`Create Volume in ${newVolumeSchema}`} />
          <ModalBody>
            <Form>
              <FormGroup label="Volume name" isRequired fieldId="volume-name">
                <TextInput id="volume-name" value={newVolumeName} onChange={(_e, v) => setNewVolumeName(v)} isRequired />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleCreateVolume} isDisabled={!newVolumeName || creatingVolume} isLoading={creatingVolume}>Create</Button>
            <Button variant="link" onClick={() => setShowCreateVolume(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default CatalogDetailPage;
