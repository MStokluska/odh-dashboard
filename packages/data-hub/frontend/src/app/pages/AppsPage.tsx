import React from 'react';
import {
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
  Form,
  FormGroup,
  Label,
  LabelGroup,
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
import {
  PlusCircleIcon,
  ExternalLinkAltIcon,
  CubesIcon,
} from '@patternfly/react-icons';

const API_PREFIX = '/data-hub/api/v1';

type RegisteredApp = {
  name: string;
  displayName: string;
  type: string;
  endpoint: string;
  mlflowExperiment: string;
  volumes: string[];
  registeredAt: string;
};

type VolumeOption = {
  fullName: string;
  name: string;
};

const AppsPage: React.FC = () => {
  const [apps, setApps] = React.useState<RegisteredApp[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [availableVolumes, setAvailableVolumes] = React.useState<VolumeOption[]>([]);

  const [showRegister, setShowRegister] = React.useState(false);
  const [formName, setFormName] = React.useState('');
  const [formDisplayName, setFormDisplayName] = React.useState('');
  const [formType, setFormType] = React.useState('deterministic');
  const [formEndpoint, setFormEndpoint] = React.useState('');
  const [formExperiment, setFormExperiment] = React.useState('');
  const [formVolumes, setFormVolumes] = React.useState<string[]>([]);
  const [typeSelectOpen, setTypeSelectOpen] = React.useState(false);
  const [volumeSelectOpen, setVolumeSelectOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [uiConfig, setUiConfig] = React.useState<{
    mlflowExperimentId: string;
  } | null>(null);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_PREFIX}/apps`).then((r) => r.json()),
      fetch(`${API_PREFIX}/catalogs`).then((r) => r.json()),
      fetch(`${API_PREFIX}/config`).then((r) => r.json()),
    ])
      .then(([appsData, catalogsData, configData]) => {
        setApps(appsData.apps || []);
        setUiConfig(configData);

        const catalogNames = (catalogsData.catalogs || []).map(
          (c: { name: string }) => c.name,
        );
        const detailPromises = catalogNames.map((name: string) =>
          fetch(`${API_PREFIX}/catalogs/${name}/detail`).then((r) => r.json()),
        );

        return Promise.all(detailPromises).then((details) => {
          const vols: VolumeOption[] = [];
          details.forEach((detail) => {
            (detail.schemas || []).forEach(
              (s: { name: string; volumes: { name: string }[] | null }) => {
                (s.volumes || []).forEach((v) => {
                  vols.push({
                    fullName: `${detail.name}.${s.name}.${v.name}`,
                    name: v.name,
                  });
                });
              },
            );
          });
          setAvailableVolumes(vols);
          setLoading(false);
        });
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRegister = () => {
    setSubmitting(true);
    fetch(`${API_PREFIX}/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        displayName: formDisplayName,
        type: formType,
        endpoint: formEndpoint,
        mlflowExperiment: formExperiment || uiConfig?.mlflowExperimentId || '',
        volumes: formVolumes,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status}`);
        }
        setShowRegister(false);
        resetForm();
        fetchData();
      })
      .catch((e) => setError(e.message))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = (name: string) => {
    fetch(`${API_PREFIX}/apps/${name}`, { method: 'DELETE' })
      .then(() => fetchData())
      .catch((e) => setError(e.message));
  };

  const resetForm = () => {
    setFormName('');
    setFormDisplayName('');
    setFormType('deterministic');
    setFormEndpoint('');
    setFormExperiment('');
    setFormVolumes([]);
  };

  if (loading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner aria-label="Loading" />
      </PageSection>
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Content component="h1">Registered Apps</Content>
            <Content component="p">
              Register RAG applications to connect them with Unity Catalog volumes, Marquez lineage,
              and MLflow traces.
            </Content>
          </SplitItem>
          <SplitItem>
            <Button
              variant="primary"
              icon={<PlusCircleIcon />}
              onClick={() => setShowRegister(true)}
            >
              Register app
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      {error ? (
        <PageSection hasBodyWrapper={false}>
          <EmptyState headingLevel="h3" titleText="Error" variant={EmptyStateVariant.sm}>
            <EmptyStateBody>{error}</EmptyStateBody>
            <Button
              variant="link"
              onClick={() => {
                setError(null);
                fetchData();
              }}
            >
              Retry
            </Button>
          </EmptyState>
        </PageSection>
      ) : null}

      <PageSection hasBodyWrapper={false}>
        {apps.length === 0 ? (
          <EmptyState
            headingLevel="h3"
            icon={CubesIcon}
            titleText="No apps registered"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              Register your RAG applications to track their lineage and query traces.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Stack hasGutter>
            {apps.map((a) => (
              <StackItem key={a.name}>
                <Card>
                  <CardTitle>
                    <Split hasGutter>
                      <SplitItem isFilled>
                        <Content component="h3">
                          <CubesIcon /> {a.displayName || a.name}
                        </Content>
                      </SplitItem>
                      <SplitItem>
                        <Label
                          color={a.type === 'deterministic' ? 'blue' : 'purple'}
                          isCompact
                        >
                          {a.type}
                        </Label>
                      </SplitItem>
                      <SplitItem>
                        <Button
                          variant="link"
                          icon={<ExternalLinkAltIcon />}
                          component="a"
                          href={a.endpoint}
                          target="_blank"
                        >
                          Open
                        </Button>
                      </SplitItem>
                      <SplitItem>
                        <Button variant="link" isDanger onClick={() => handleDelete(a.name)}>
                          Delete
                        </Button>
                      </SplitItem>
                    </Split>
                  </CardTitle>
                  <CardBody>
                    <DescriptionList isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Name</DescriptionListTerm>
                        <DescriptionListDescription>{a.name}</DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Endpoint</DescriptionListTerm>
                        <DescriptionListDescription>{a.endpoint}</DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>MLflow Experiment</DescriptionListTerm>
                        <DescriptionListDescription>
                          {a.mlflowExperiment}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Linked Volumes</DescriptionListTerm>
                        <DescriptionListDescription>
                          <LabelGroup>
                            {a.volumes.map((v) => (
                              <Label key={v} isCompact color="cyan">
                                {v}
                              </Label>
                            ))}
                          </LabelGroup>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Registered</DescriptionListTerm>
                        <DescriptionListDescription>
                          {a.registeredAt
                            ? new Date(a.registeredAt).toLocaleString()
                            : 'Unknown'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </CardBody>
                </Card>
              </StackItem>
            ))}
          </Stack>
        )}
      </PageSection>

      {showRegister ? (
        <Modal isOpen onClose={() => setShowRegister(false)} variant="medium">
          <ModalHeader title="Register Application" />
          <ModalBody>
            <Form>
              <FormGroup label="App name" isRequired fieldId="app-name">
                <TextInput
                  id="app-name"
                  value={formName}
                  onChange={(_e, v) => setFormName(v)}
                  placeholder="e.g. uc-chat"
                />
              </FormGroup>
              <FormGroup label="Display name" fieldId="app-display">
                <TextInput
                  id="app-display"
                  value={formDisplayName}
                  onChange={(_e, v) => setFormDisplayName(v)}
                  placeholder="e.g. Underwriting Knowledge Assistant"
                />
              </FormGroup>
              <FormGroup label="Type" isRequired fieldId="app-type">
                <Select
                  id="app-type"
                  isOpen={typeSelectOpen}
                  selected={formType}
                  onSelect={(_e, val) => {
                    setFormType(val as string);
                    setTypeSelectOpen(false);
                  }}
                  onOpenChange={setTypeSelectOpen}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setTypeSelectOpen(!typeSelectOpen)}
                      isExpanded={typeSelectOpen}
                      isFullWidth
                    >
                      {formType}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    <SelectOption value="deterministic">
                      Deterministic (LangGraph)
                    </SelectOption>
                    <SelectOption value="agentic">Agentic (OGX + MCP)</SelectOption>
                  </SelectList>
                </Select>
              </FormGroup>
              <FormGroup label="Endpoint URL" isRequired fieldId="app-endpoint">
                <TextInput
                  id="app-endpoint"
                  value={formEndpoint}
                  onChange={(_e, v) => setFormEndpoint(v)}
                  placeholder="https://my-app.apps.example.com"
                />
              </FormGroup>
              <FormGroup label="MLflow Experiment" fieldId="app-experiment">
                <TextInput
                  id="app-experiment"
                  value={formExperiment}
                  onChange={(_e, v) => setFormExperiment(v)}
                  placeholder={uiConfig?.mlflowExperimentId || '59'}
                />
              </FormGroup>
              <FormGroup label="Linked Volumes" fieldId="app-volumes">
                <Select
                  id="app-volumes"
                  isOpen={volumeSelectOpen}
                  selected={formVolumes}
                  onSelect={(_e, val) => {
                    const v = val as string;
                    setFormVolumes((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                    );
                  }}
                  onOpenChange={setVolumeSelectOpen}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setVolumeSelectOpen(!volumeSelectOpen)}
                      isExpanded={volumeSelectOpen}
                      isFullWidth
                    >
                      {formVolumes.length > 0
                        ? `${formVolumes.length} volumes selected`
                        : 'Select volumes'}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {availableVolumes.map((v) => (
                      <SelectOption
                        key={v.fullName}
                        value={v.fullName}
                        hasCheckbox
                        isSelected={formVolumes.includes(v.fullName)}
                      >
                        {v.fullName}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
                {formVolumes.length > 0 ? (
                  <LabelGroup>
                    {formVolumes.map((v) => (
                      <Label
                        key={v}
                        isCompact
                        onClose={() => setFormVolumes((prev) => prev.filter((x) => x !== v))}
                      >
                        {v}
                      </Label>
                    ))}
                  </LabelGroup>
                ) : null}
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={handleRegister}
              isDisabled={!formName || !formEndpoint || submitting}
              isLoading={submitting}
            >
              Register
            </Button>
            <Button variant="link" onClick={() => setShowRegister(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default AppsPage;
