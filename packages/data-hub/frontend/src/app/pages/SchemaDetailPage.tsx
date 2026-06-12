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
  PageSection,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon, DatabaseIcon, FolderIcon, EyeIcon } from '@patternfly/react-icons';
import VolumeProvenancePage from './VolumeProvenancePage';

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

type SchemaDetailPageProps = {
  catalogName: string;
  schema: {
    name: string;
    comment: string;
    tables: TableInfo[] | null;
    volumes: VolumeInfo[] | null;
  };
  onBack: () => void;
  marquezUrl?: string;
  mlflowUrl?: string;
  mlflowExperimentId?: string;
  mlflowWorkspace?: string;
};

const SchemaDetailPage: React.FC<SchemaDetailPageProps> = ({
  catalogName,
  schema,
  onBack,
  marquezUrl = '',
  mlflowUrl = '',
  mlflowExperimentId = '59',
  mlflowWorkspace = 'mstoklus',
}) => {
  const [selectedVolume, setSelectedVolume] = React.useState<VolumeInfo | null>(null);

  if (selectedVolume) {
    return (
      <VolumeProvenancePage
        catalogName={catalogName}
        schemaName={schema.name}
        volume={selectedVolume}
        marquezUrl={marquezUrl}
        mlflowUrl={mlflowUrl}
        mlflowExperimentId={mlflowExperimentId}
        mlflowWorkspace={mlflowWorkspace}
        onBack={() => setSelectedVolume(null)}
      />
    );
  }

  return (
  <>
    <PageSection hasBodyWrapper={false}>
      <Breadcrumb>
        <BreadcrumbItem>
          <Button variant="link" onClick={onBack}>
            {catalogName}
          </Button>
        </BreadcrumbItem>
        <BreadcrumbItem isActive>{schema.name}</BreadcrumbItem>
      </Breadcrumb>
      <Stack hasGutter>
        <StackItem>
          <Split hasGutter>
            <SplitItem isFilled>
              <Content component="h1">{schema.name}</Content>
            </SplitItem>
            <SplitItem>
              <Button
                variant="secondary"
                component="a"
                href={`${marquezUrl}/lineage/dataset/${catalogName}/${schema.name}.${schema.tables?.[0]?.name || schema.volumes?.[0]?.name || 'default'}?depth=10`}
                target="_blank"
              >
                View lineage
              </Button>
            </SplitItem>
            <SplitItem>
              <Label color="cyan">Schema</Label>
            </SplitItem>
          </Split>
        </StackItem>
        {schema.comment ? (
          <StackItem>
            <Content component="p">{schema.comment}</Content>
          </StackItem>
        ) : null}
      </Stack>
    </PageSection>

    <PageSection hasBodyWrapper={false}>
      <Stack hasGutter>
        <StackItem>
          <Content component="h2">
            <DatabaseIcon /> Tables ({schema.tables?.length || 0})
          </Content>
        </StackItem>
        <StackItem>
          {!schema.tables || schema.tables.length === 0 ? (
            <EmptyState headingLevel="h3" titleText="No tables" variant={EmptyStateVariant.sm}>
              <EmptyStateBody>No tables in this schema yet.</EmptyStateBody>
            </EmptyState>
          ) : (
            <Stack hasGutter>
              {schema.tables.map((t) => (
                <StackItem key={t.name}>
                  <Card>
                    <CardTitle>
                      <Split hasGutter>
                        <SplitItem isFilled>
                          <Content component="h3">{t.name}</Content>
                        </SplitItem>
                        <SplitItem>
                          <Flex>
                            <FlexItem>
                              <Label color="orange" isCompact>
                                {t.data_source_format}
                              </Label>
                            </FlexItem>
                            <FlexItem>
                              <Label isCompact>{t.table_type}</Label>
                            </FlexItem>
                          </Flex>
                        </SplitItem>
                      </Split>
                    </CardTitle>
                    <CardBody>
                      <Stack hasGutter>
                        {t.comment ? (
                          <StackItem>
                            <Content component="p">{t.comment}</Content>
                          </StackItem>
                        ) : null}

                        <StackItem>
                          <DescriptionList isHorizontal>
                            {t.storage_location ? (
                              <DescriptionListGroup>
                                <DescriptionListTerm>Storage location</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <ClipboardCopy isReadOnly variant="inline-compact">
                                    {t.storage_location}
                                  </ClipboardCopy>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ) : null}
                            <DescriptionListGroup>
                              <DescriptionListTerm>Full name</DescriptionListTerm>
                              <DescriptionListDescription>
                                <ClipboardCopy isReadOnly variant="inline-compact">
                                  {catalogName}.{schema.name}.{t.name}
                                </ClipboardCopy>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          </DescriptionList>
                        </StackItem>

                        {t.columns && t.columns.length > 0 ? (
                          <StackItem>
                            <Content component="h4">Columns</Content>
                            <DescriptionList isHorizontal columnModifier={{ default: '2Col' }}>
                              {t.columns
                                .sort((a, b) => a.position - b.position)
                                .map((c) => (
                                  <DescriptionListGroup key={c.name}>
                                    <DescriptionListTerm>
                                      {c.name}{' '}
                                      <Label isCompact color="grey">
                                        {c.type_name}
                                      </Label>
                                    </DescriptionListTerm>
                                    <DescriptionListDescription>
                                      {c.comment || '—'}
                                    </DescriptionListDescription>
                                  </DescriptionListGroup>
                                ))}
                            </DescriptionList>
                          </StackItem>
                        ) : null}

                        <StackItem>
                          <Flex>
                            <FlexItem>
                              <Button
                                variant="link"
                                icon={<ExternalLinkAltIcon />}
                                component="a"
                                href={`${marquezUrl}/lineage/dataset/${catalogName}/${schema.name}.${t.name}`}
                                target="_blank"
                              >
                                Lineage
                              </Button>
                            </FlexItem>
                            <FlexItem>
                              <Button
                                variant="link"
                                icon={<ExternalLinkAltIcon />}
                                component="a"
                                href={`${mlflowUrl}/mlflow/#/experiments/${mlflowExperimentId}/traces?workspace=${mlflowWorkspace}`}
                                target="_blank"
                              >
                                MLflow Traces
                              </Button>
                            </FlexItem>
                          </Flex>
                        </StackItem>
                      </Stack>
                    </CardBody>
                  </Card>
                </StackItem>
              ))}
            </Stack>
          )}
        </StackItem>

        <StackItem>
          <Content component="h2">
            <FolderIcon /> Volumes ({schema.volumes?.length || 0})
          </Content>
        </StackItem>
        <StackItem>
          {!schema.volumes || schema.volumes.length === 0 ? (
            <EmptyState headingLevel="h3" titleText="No volumes" variant={EmptyStateVariant.sm}>
              <EmptyStateBody>No volumes in this schema yet.</EmptyStateBody>
            </EmptyState>
          ) : (
            <Stack hasGutter>
              {schema.volumes.map((v) => (
                <StackItem key={v.name}>
                  <Card>
                    <CardTitle>
                      <Split hasGutter>
                        <SplitItem isFilled>
                          <Content component="h3">{v.name}</Content>
                        </SplitItem>
                        <SplitItem>
                          <Label color="green" isCompact>
                            {v.volume_type}
                          </Label>
                        </SplitItem>
                      </Split>
                    </CardTitle>
                    <CardBody>
                      <Stack hasGutter>
                        {v.comment ? (
                          <StackItem>
                            <Content component="p">{v.comment}</Content>
                          </StackItem>
                        ) : null}
                        <StackItem>
                          <DescriptionList isHorizontal>
                            {v.storage_location ? (
                              <DescriptionListGroup>
                                <DescriptionListTerm>Storage location</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <ClipboardCopy isReadOnly variant="inline-compact">
                                    {v.storage_location}
                                  </ClipboardCopy>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ) : null}
                            <DescriptionListGroup>
                              <DescriptionListTerm>Full name</DescriptionListTerm>
                              <DescriptionListDescription>
                                <ClipboardCopy isReadOnly variant="inline-compact">
                                  {catalogName}.{schema.name}.{v.name}
                                </ClipboardCopy>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          </DescriptionList>
                        </StackItem>
                        <StackItem>
                          <Flex>
                            <FlexItem>
                              <Button
                                variant="link"
                                icon={<EyeIcon />}
                                onClick={() => setSelectedVolume(v)}
                              >
                                View Provenance
                              </Button>
                            </FlexItem>
                            <FlexItem>
                              <Button
                                variant="link"
                                icon={<ExternalLinkAltIcon />}
                                component="a"
                                href={`${marquezUrl}/lineage/dataset/${catalogName}/${schema.name}.${v.name}`}
                                target="_blank"
                              >
                                Lineage
                              </Button>
                            </FlexItem>
                            <FlexItem>
                              <Button
                                variant="link"
                                icon={<ExternalLinkAltIcon />}
                                component="a"
                                href={`${mlflowUrl}/mlflow/#/experiments/${mlflowExperimentId}/traces?workspace=${mlflowWorkspace}`}
                                target="_blank"
                              >
                                MLflow Traces
                              </Button>
                            </FlexItem>
                          </Flex>
                        </StackItem>
                      </Stack>
                    </CardBody>
                  </Card>
                </StackItem>
              ))}
            </Stack>
          )}
        </StackItem>



      </Stack>
    </PageSection>
  </>
  );
};

export default SchemaDetailPage;
