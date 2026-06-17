import React from 'react';
import {
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
  Tab,
  TabContent,
  TabTitleText,
  Tabs,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import { PlusCircleIcon, UsersIcon } from '@patternfly/react-icons';

const API_PREFIX = '/data-hub/api/v1';

type PrivilegeAssignment = {
  principal: string;
  privileges: string[];
};

type ResourcePermissions = {
  privilege_assignments: PrivilegeAssignment[];
};

type ResourceItem = {
  type: 'catalog' | 'schema' | 'volume' | 'table';
  name: string;
  fullName: string;
  catalog?: string;
  schema?: string;
};

type SCIMUser = {
  userName: string;
  displayName: string;
};

type PermGroup = {
  metadata: { name: string };
  users: string[];
};

const PRIVILEGE_OPTIONS: Record<string, string[]> = {
  catalog: ['USE CATALOG', 'CATALOG ADMIN'],
  schema: ['USE SCHEMA', 'CREATE TABLE', 'CREATE VOLUME'],
  volume: ['READ VOLUME', 'WRITE VOLUME'],
  table: ['SELECT', 'MODIFY'],
};

const CATALOG_ADMIN_PRIVILEGES = ['USE CATALOG', 'CREATE SCHEMA', 'SELECT', 'MODIFY'];

const PRIVILEGE_COLORS: Record<string, 'green' | 'blue' | 'orange' | 'cyan'> = {
  'USE CATALOG': 'cyan',
  'USE SCHEMA': 'cyan',
  'CATALOG ADMIN': 'orange',
  'CREATE TABLE': 'blue',
  'CREATE VOLUME': 'blue',
  'CREATE SCHEMA': 'blue',
  'READ VOLUME': 'green',
  'WRITE VOLUME': 'orange',
  SELECT: 'green',
  MODIFY: 'orange',
};

const PermissionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState(0);
  const [resources, setResources] = React.useState<Record<string, ResourceItem[]>>({
    catalog: [],
    schema: [],
    volume: [],
    table: [],
  });
  const [permissions, setPermissions] = React.useState<Record<string, ResourcePermissions>>({});
  const [loading, setLoading] = React.useState(true);
  const [scimUsers, setScimUsers] = React.useState<SCIMUser[]>([]);
  const [permGroups, setPermGroups] = React.useState<PermGroup[]>([]);
  const [ocpUsers, setOcpUsers] = React.useState<string[]>([]);

  const [showAddModal, setShowAddModal] = React.useState(false);
  const [addTarget, setAddTarget] = React.useState<ResourceItem | null>(null);
  const [principalMode, setPrincipalMode] = React.useState<'user' | 'group'>('user');
  const [addUser, setAddUser] = React.useState('');
  const [addGroup, setAddGroup] = React.useState('');
  const [addPrivileges, setAddPrivileges] = React.useState<string[]>([]);
  const [userSelectOpen, setUserSelectOpen] = React.useState(false);
  const [groupSelectOpen, setGroupSelectOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [selectedGroupUsers, setSelectedGroupUsers] = React.useState<string[]>([]);
  const [ocpUserSelectOpen, setOcpUserSelectOpen] = React.useState(false);
  const [creatingGroup, setCreatingGroup] = React.useState(false);

  const [showPropagateModal, setShowPropagateModal] = React.useState(false);
  const [propagateTarget, setPropagateTarget] = React.useState<ResourceItem | null>(null);
  const [propagatePrincipalMode, setPropagatePrincipalMode] = React.useState<'user' | 'group'>(
    'user',
  );
  const [propagateUser, setPropagateUser] = React.useState('');
  const [propagateGroup, setPropagateGroup] = React.useState('');
  const [propagateUserOpen, setPropagateUserOpen] = React.useState(false);
  const [propagateGroupOpen, setPropagateGroupOpen] = React.useState(false);
  const [propagating, setPropagating] = React.useState(false);

  const tabTypes = ['catalog', 'schema', 'volume', 'table'] as const;

  const fetchData = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_PREFIX}/catalogs`).then((r) => r.json()),
      fetch(`${API_PREFIX}/scim/users`).then((r) => r.json()),
      fetch(`${API_PREFIX}/perm-groups`).then((r) => r.json()),
      fetch(`${API_PREFIX}/ocp-users`).then((r) => r.json()),
    ])
      .then(([catalogsData, usersData, groupsData, ocpData]) => {
        const catalogs: ResourceItem[] = (catalogsData.catalogs || []).map(
          (c: { name: string }) => ({
            type: 'catalog' as const,
            name: c.name,
            fullName: c.name,
          }),
        );

        setScimUsers(
          (usersData.Resources || []).map((u: { userName: string; displayName: string }) => ({
            userName: u.userName,
            displayName: u.displayName,
          })),
        );
        setPermGroups(groupsData.groups || []);
        setOcpUsers(ocpData.users || []);

        const detailPromises = catalogs.map((c) =>
          fetch(`${API_PREFIX}/catalogs/${c.name}/detail`).then((r) => r.json()),
        );

        return Promise.all(detailPromises).then((details) => {
          const schemaItems: ResourceItem[] = [];
          const volumeItems: ResourceItem[] = [];
          const tableItems: ResourceItem[] = [];

          details.forEach((detail) => {
            (detail.schemas || []).forEach(
              (s: {
                name: string;
                volumes: { name: string }[] | null;
                tables: { name: string }[] | null;
              }) => {
                schemaItems.push({
                  type: 'schema',
                  name: `${detail.name}.${s.name}`,
                  fullName: `${detail.name}.${s.name}`,
                  catalog: detail.name,
                  schema: s.name,
                });
                (s.volumes || []).forEach((v) => {
                  volumeItems.push({
                    type: 'volume',
                    name: `${detail.name}.${s.name}.${v.name}`,
                    fullName: `${detail.name}.${s.name}.${v.name}`,
                  });
                });
                (s.tables || []).forEach((t) => {
                  tableItems.push({
                    type: 'table',
                    name: `${detail.name}.${s.name}.${t.name}`,
                    fullName: `${detail.name}.${s.name}.${t.name}`,
                  });
                });
              },
            );
          });

          setResources({
            catalog: catalogs,
            schema: schemaItems,
            volume: volumeItems,
            table: tableItems,
          });

          const allItems = [...catalogs, ...schemaItems, ...volumeItems, ...tableItems];
          const permPromises = allItems.map((item) =>
            fetch(`${API_PREFIX}/permissions/${item.type}/${item.fullName}`)
              .then((r) => r.json())
              .then((data) => ({ key: `${item.type}:${item.fullName}`, data }))
              .catch(() => ({
                key: `${item.type}:${item.fullName}`,
                data: { privilege_assignments: [] },
              })),
          );

          return Promise.all(permPromises).then((results) => {
            const permMap: Record<string, ResourcePermissions> = {};
            results.forEach((result) => {
              permMap[result.key] = result.data;
            });
            setPermissions(permMap);
            setLoading(false);
          });
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

  const handleAddPermission = () => {
    if (!addTarget) {
      return;
    }
    const principal = principalMode === 'group' ? addGroup : addUser;
    if (!principal || addPrivileges.length === 0) {
      return;
    }

    setSubmitting(true);
    const expandedPrivileges = addPrivileges.includes('CATALOG ADMIN')
      ? [...CATALOG_ADMIN_PRIVILEGES, ...addPrivileges.filter((p) => p !== 'CATALOG ADMIN')]
      : addPrivileges;
    const uniquePrivileges = [...new Set(expandedPrivileges)];

    fetch(`${API_PREFIX}/permissions/${addTarget.type}/${addTarget.fullName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [
          {
            principal,
            type: principalMode,
            add: uniquePrivileges,
          },
        ],
      }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status}`);
        }
        setShowAddModal(false);
        setAddUser('');
        setAddGroup('');
        setAddPrivileges([]);
        setAddTarget(null);
        fetchData();
      })
      .catch((e) => setError(e.message))
      .finally(() => setSubmitting(false));
  };

  const handleRemovePrivilege = (
    resource: ResourceItem,
    principal: string,
    privilege: string,
  ) => {
    fetch(`${API_PREFIX}/permissions/${resource.type}/${resource.fullName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [{ principal, remove: [privilege] }],
      }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status}`);
        }
        fetchData();
      })
      .catch((e) => setError(e.message));
  };

  const handlePropagateSchema = () => {
    if (!propagateTarget) {
      return;
    }
    const principal =
      propagatePrincipalMode === 'group' ? propagateGroup : propagateUser;
    if (!principal) {
      return;
    }

    setPropagating(true);
    fetch(`${API_PREFIX}/permissions/propagate-schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal,
        type: propagatePrincipalMode,
        catalog: propagateTarget.catalog,
        schema: propagateTarget.schema,
        include_catalog: true,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status}`);
        }
        setShowPropagateModal(false);
        setPropagateUser('');
        setPropagateGroup('');
        fetchData();
      })
      .catch((e) => setError(e.message))
      .finally(() => setPropagating(false));
  };

  const handleCreateGroup = () => {
    setCreatingGroup(true);
    fetch(`${API_PREFIX}/perm-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName, users: selectedGroupUsers }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`${r.status}`);
        }
        setShowCreateGroup(false);
        setNewGroupName('');
        setSelectedGroupUsers([]);
        fetchData();
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreatingGroup(false));
  };

  const handleDeleteGroup = (name: string) => {
    fetch(`${API_PREFIX}/perm-groups/${name}`, { method: 'DELETE' })
      .then(() => fetchData())
      .catch((e) => setError(e.message));
  };

  const openAddModal = (resource: ResourceItem) => {
    setAddTarget(resource);
    setAddUser('');
    setAddGroup('');
    setAddPrivileges([]);
    setPrincipalMode('user');
    setShowAddModal(true);
  };

  const openPropagateModal = (resource: ResourceItem) => {
    setPropagateTarget(resource);
    setPropagateUser('');
    setPropagateGroup('');
    setPropagatePrincipalMode('user');
    setShowPropagateModal(true);
  };

  if (loading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner aria-label="Loading" />
      </PageSection>
    );
  }

  const renderResourceTab = (type: (typeof tabTypes)[number]) => {
    const items = resources[type];
    if (items.length === 0) {
      return (
        <EmptyState headingLevel="h3" titleText={`No ${type}s`} variant={EmptyStateVariant.sm}>
          <EmptyStateBody>No {type}s found.</EmptyStateBody>
        </EmptyState>
      );
    }
    return (
      <Stack hasGutter>
        {items.map((resource) => {
          const key = `${resource.type}:${resource.fullName}`;
          const perms = permissions[key]?.privilege_assignments || [];
          return (
            <StackItem key={resource.fullName}>
              <Card>
                <CardTitle>
                  <Split hasGutter>
                    <SplitItem isFilled>
                      <Content component="h3">{resource.name}</Content>
                    </SplitItem>
                    {type === 'schema' ? (
                      <SplitItem>
                        <Button
                          variant="secondary"
                          icon={<UsersIcon />}
                          onClick={() => openPropagateModal(resource)}
                        >
                          Grant schema access
                        </Button>
                      </SplitItem>
                    ) : null}
                    <SplitItem>
                      <Button
                        variant="link"
                        icon={<PlusCircleIcon />}
                        onClick={() => openAddModal(resource)}
                      >
                        Add permission
                      </Button>
                    </SplitItem>
                  </Split>
                </CardTitle>
                <CardBody>
                  {perms.length === 0 ? (
                    <Content component="small">No permissions set</Content>
                  ) : (
                    <Stack hasGutter>
                      {perms.map((pa) => (
                        <StackItem key={pa.principal}>
                          <Flex>
                            <FlexItem>
                              <Content component="small">
                                <strong>{pa.principal}</strong>
                              </Content>
                            </FlexItem>
                            {pa.privileges.map((priv) => (
                              <FlexItem key={priv}>
                                <Label
                                  color={PRIVILEGE_COLORS[priv] || 'grey'}
                                  isCompact
                                  onClose={() =>
                                    handleRemovePrivilege(resource, pa.principal, priv)
                                  }
                                >
                                  {priv}
                                </Label>
                              </FlexItem>
                            ))}
                          </Flex>
                        </StackItem>
                      ))}
                    </Stack>
                  )}
                </CardBody>
              </Card>
            </StackItem>
          );
        })}
      </Stack>
    );
  };

  const renderGroupsTab = () => (
    <Stack hasGutter>
      <StackItem>
        <Flex>
          <FlexItem align={{ default: 'alignRight' }}>
            <Button
              variant="primary"
              icon={<PlusCircleIcon />}
              onClick={() => setShowCreateGroup(true)}
            >
              Create group
            </Button>
          </FlexItem>
        </Flex>
      </StackItem>
      {permGroups.length === 0 ? (
        <StackItem>
          <EmptyState headingLevel="h3" titleText="No groups" variant={EmptyStateVariant.sm}>
            <EmptyStateBody>
              Create a permission group to organize users for batch permission grants.
            </EmptyStateBody>
          </EmptyState>
        </StackItem>
      ) : (
        permGroups.map((g) => (
          <StackItem key={g.metadata.name}>
            <Card>
              <CardTitle>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <Content component="h3">
                      <UsersIcon /> {g.metadata.name}
                    </Content>
                  </SplitItem>
                  <SplitItem>
                    <Label color="blue" isCompact>
                      {(g.users || []).length} members
                    </Label>
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="link"
                      isDanger
                      onClick={() => handleDeleteGroup(g.metadata.name)}
                    >
                      Delete
                    </Button>
                  </SplitItem>
                </Split>
              </CardTitle>
              <CardBody>
                <LabelGroup>
                  {(g.users || []).map((u) => (
                    <Label key={u} isCompact>
                      {u}
                    </Label>
                  ))}
                </LabelGroup>
              </CardBody>
            </Card>
          </StackItem>
        ))
      )}
    </Stack>
  );

  const renderPrincipalSelect = (
    mode: 'user' | 'group',
    setMode: (m: 'user' | 'group') => void,
    user: string,
    setUser: (u: string) => void,
    group: string,
    setGroup: (g: string) => void,
    uOpen: boolean,
    setUOpen: (o: boolean) => void,
    gOpen: boolean,
    setGOpen: (o: boolean) => void,
  ) => (
    <>
      <FormGroup label="Grant to" fieldId="principal-mode">
        <ToggleGroup aria-label="Principal type">
          <ToggleGroupItem
            text="User"
            isSelected={mode === 'user'}
            onChange={() => setMode('user')}
          />
          <ToggleGroupItem
            text="Group"
            isSelected={mode === 'group'}
            onChange={() => setMode('group')}
          />
        </ToggleGroup>
      </FormGroup>
      {mode === 'user' ? (
        <FormGroup label="User" isRequired fieldId="perm-user">
          <Select
            id="perm-user"
            isOpen={uOpen}
            selected={user}
            onSelect={(_e, val) => {
              setUser(val as string);
              setUOpen(false);
            }}
            onOpenChange={setUOpen}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setUOpen(!uOpen)}
                isExpanded={uOpen}
                isFullWidth
              >
                {user || 'Select user'}
              </MenuToggle>
            )}
          >
            <SelectList>
              {scimUsers.map((u) => (
                <SelectOption key={u.userName} value={u.userName}>
                  {u.displayName} ({u.userName})
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </FormGroup>
      ) : (
        <FormGroup label="Group" isRequired fieldId="perm-group">
          <Select
            id="perm-group"
            isOpen={gOpen}
            selected={group}
            onSelect={(_e, val) => {
              setGroup(val as string);
              setGOpen(false);
            }}
            onOpenChange={setGOpen}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setGOpen(!gOpen)}
                isExpanded={gOpen}
                isFullWidth
              >
                {group || 'Select group'}
              </MenuToggle>
            )}
          >
            <SelectList>
              {permGroups.map((g) => (
                <SelectOption key={g.metadata.name} value={g.metadata.name}>
                  {g.metadata.name} ({(g.users || []).length} members)
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </FormGroup>
      )}
    </>
  );

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Content component="h1">Manage Permissions</Content>
        <Content component="p">
          Grant and revoke Unity Catalog permissions on catalogs, schemas, volumes, and tables.
          Use groups to batch-manage permissions for multiple users.
        </Content>
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
        <Tabs
          activeKey={activeTab}
          onSelect={(_e, idx) => setActiveTab(idx as number)}
          aria-label="Permission tabs"
        >
          {tabTypes.map((type, idx) => (
            <Tab
              key={type}
              eventKey={idx}
              title={
                <TabTitleText>
                  {type.charAt(0).toUpperCase() + type.slice(1)}s ({resources[type].length})
                </TabTitleText>
              }
            >
              <TabContent id={`tab-${type}`}>{renderResourceTab(type)}</TabContent>
            </Tab>
          ))}
          <Tab
            eventKey={4}
            title={<TabTitleText>Groups ({permGroups.length})</TabTitleText>}
          >
            <TabContent id="tab-groups">{renderGroupsTab()}</TabContent>
          </Tab>
        </Tabs>
      </PageSection>

      {/* Add Permission Modal */}
      {showAddModal && addTarget ? (
        <Modal isOpen onClose={() => setShowAddModal(false)} variant="small">
          <ModalHeader title={`Add permission: ${addTarget.name}`} />
          <ModalBody>
            <Form>
              {renderPrincipalSelect(
                principalMode,
                setPrincipalMode,
                addUser,
                setAddUser,
                addGroup,
                setAddGroup,
                userSelectOpen,
                setUserSelectOpen,
                groupSelectOpen,
                setGroupSelectOpen,
              )}
              <FormGroup label="Privileges" isRequired fieldId="perm-privs">
                <Flex>
                  {PRIVILEGE_OPTIONS[addTarget.type].map((priv) => (
                    <FlexItem key={priv}>
                      <Label
                        color={
                          addPrivileges.includes(priv)
                            ? PRIVILEGE_COLORS[priv] || 'blue'
                            : 'grey'
                        }
                        onClick={() => {
                          setAddPrivileges((prev) =>
                            prev.includes(priv)
                              ? prev.filter((p) => p !== priv)
                              : [...prev, priv],
                          );
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {addPrivileges.includes(priv) ? '+ ' : ''}
                        {priv}
                      </Label>
                    </FlexItem>
                  ))}
                </Flex>
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={handleAddPermission}
              isDisabled={
                (!addUser && !addGroup) || addPrivileges.length === 0 || submitting
              }
              isLoading={submitting}
            >
              Grant
            </Button>
            <Button variant="link" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {/* Propagate Schema Modal */}
      {showPropagateModal && propagateTarget ? (
        <Modal isOpen onClose={() => setShowPropagateModal(false)} variant="small">
          <ModalHeader title={`Grant schema access: ${propagateTarget.name}`} />
          <ModalBody>
            <Stack hasGutter>
              <StackItem>
                <Content component="p">
                  This will grant <strong>USE CATALOG</strong> + <strong>USE SCHEMA</strong> and
                  propagate <strong>READ VOLUME</strong> to all volumes +{' '}
                  <strong>SELECT</strong> to all tables in this schema.
                </Content>
              </StackItem>
              <StackItem>
                <Form>
                  {renderPrincipalSelect(
                    propagatePrincipalMode,
                    setPropagatePrincipalMode,
                    propagateUser,
                    setPropagateUser,
                    propagateGroup,
                    setPropagateGroup,
                    propagateUserOpen,
                    setPropagateUserOpen,
                    propagateGroupOpen,
                    setPropagateGroupOpen,
                  )}
                </Form>
              </StackItem>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={handlePropagateSchema}
              isDisabled={(!propagateUser && !propagateGroup) || propagating}
              isLoading={propagating}
            >
              Grant full schema access
            </Button>
            <Button variant="link" onClick={() => setShowPropagateModal(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {/* Create Group Modal */}
      {showCreateGroup ? (
        <Modal isOpen onClose={() => setShowCreateGroup(false)} variant="small">
          <ModalHeader title="Create permission group" />
          <ModalBody>
            <Form>
              <FormGroup label="Group name" isRequired fieldId="group-name">
                <TextInput
                  id="group-name"
                  value={newGroupName}
                  onChange={(_e, v) => setNewGroupName(v)}
                  placeholder="e.g. underwriting-team"
                />
              </FormGroup>
              <FormGroup label="Members" fieldId="group-members">
                <Select
                  id="group-members"
                  isOpen={ocpUserSelectOpen}
                  selected={selectedGroupUsers}
                  onSelect={(_e, val) => {
                    const v = val as string;
                    setSelectedGroupUsers((prev) =>
                      prev.includes(v) ? prev.filter((u) => u !== v) : [...prev, v],
                    );
                  }}
                  onOpenChange={setOcpUserSelectOpen}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setOcpUserSelectOpen(!ocpUserSelectOpen)}
                      isExpanded={ocpUserSelectOpen}
                      isFullWidth
                    >
                      {selectedGroupUsers.length > 0
                        ? `${selectedGroupUsers.length} selected`
                        : 'Select users'}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {ocpUsers.map((u) => (
                      <SelectOption
                        key={u}
                        value={u}
                        hasCheckbox
                        isSelected={selectedGroupUsers.includes(u)}
                      >
                        {u}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
                {selectedGroupUsers.length > 0 ? (
                  <LabelGroup>
                    {selectedGroupUsers.map((u) => (
                      <Label
                        key={u}
                        isCompact
                        onClose={() =>
                          setSelectedGroupUsers((prev) => prev.filter((x) => x !== u))
                        }
                      >
                        {u}
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
              onClick={handleCreateGroup}
              isDisabled={!newGroupName || creatingGroup}
              isLoading={creatingGroup}
            >
              Create
            </Button>
            <Button variant="link" onClick={() => setShowCreateGroup(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default PermissionsPage;
