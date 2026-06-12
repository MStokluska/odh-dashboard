import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  LabelGroup,
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
  Content,
  Select,
  SelectList,
  SelectOption,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
  Spinner,
} from '@patternfly/react-core';
import { UsersIcon, PlusCircleIcon, TrashIcon } from '@patternfly/react-icons';

const API_PREFIX = '/data-hub/api/v1';

type Group = {
  metadata: { name: string };
  users: string[];
};

const AdminPage: React.FC = () => {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [ocpUsers, setOcpUsers] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([]);
  const [userSelectOpen, setUserSelectOpen] = React.useState(false);
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const [deletingGroup, setDeletingGroup] = React.useState<string | null>(null);
  const [managingGroup, setManagingGroup] = React.useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = React.useState('');
  const [addMemberRole, setAddMemberRole] = React.useState<'Reader' | 'Catalog Admin'>('Reader');
  const [addMemberSelectOpen, setAddMemberSelectOpen] = React.useState(false);
  const [addMemberRoleOpen, setAddMemberRoleOpen] = React.useState(false);
  const [addingMember, setAddingMember] = React.useState(false);

  const fetchData = React.useCallback(() => {
    setLoaded(false);
    Promise.all([
      fetch(`${API_PREFIX}/groups`).then((r) => r.json()),
      fetch(`${API_PREFIX}/ocp-users`).then((r) => r.json()).catch(() => ({ users: [] })),
    ])
      .then(([groupData, userData]) => {
        setGroups(groupData.groups || []);
        setOcpUsers(userData.users || []);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateGroup = () => {
    setCreatingGroup(true);
    fetch(`${API_PREFIX}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName, users: selectedUsers }),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((d) => {
            throw new Error(d.message || r.statusText);
          });
        }
        return r.json();
      })
      .then(() => {
        setShowCreateGroup(false);
        setNewGroupName('');
        setSelectedUsers([]);
        fetchData();
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreatingGroup(false));
  };

  const handleDeleteGroup = (groupName: string) => {
    setDeletingGroup(groupName);
    fetch(`${API_PREFIX}/groups/${groupName}`, {
      method: 'DELETE',
    })
      .then(() => fetchData())
      .catch((e) => setError(e.message))
      .finally(() => setDeletingGroup(null));
  };

  const handleUserSelect = (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
    const user = String(value);
    setSelectedUsers((prev) =>
      prev.includes(user) ? prev.filter((u) => u !== user) : [...prev, user],
    );
  };

  if (!loaded) {
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
            <Content component="h1">Data Hub Administration</Content>
          </SplitItem>
        </Split>
      </PageSection>

      {error ? (
        <PageSection hasBodyWrapper={false}>
          <EmptyState headingLevel="h2" titleText="Error" variant={EmptyStateVariant.lg}>
            <EmptyStateBody>{error}</EmptyStateBody>
            <Button variant="primary" onClick={() => { setError(null); fetchData(); }}>
              Retry
            </Button>
          </EmptyState>
        </PageSection>
      ) : null}

      <PageSection hasBodyWrapper={false}>
        <Stack hasGutter>
          <StackItem>
            <Flex>
              <FlexItem>
                <Content component="h2">Groups & Catalogs</Content>
              </FlexItem>
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
          <StackItem>
            <Content component="p">
              Each group automatically creates a matching catalog. Members get access to the catalog.
            </Content>
          </StackItem>
          <StackItem>
            {groups.length === 0 ? (
              <EmptyState
                headingLevel="h3"
                icon={UsersIcon}
                titleText="No groups"
                variant={EmptyStateVariant.sm}
              >
                <EmptyStateBody>
                  Create a group to organize users and assign catalog access.
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <Gallery hasGutter minWidths={{ default: '320px' }}>
                {groups.map((g) => (
                  <GalleryItem key={g.metadata.name}>
                    <Card isFullHeight>
                      <CardTitle>
                        <Split hasGutter>
                          <SplitItem isFilled>
                            <Stack>
                              <StackItem>{g.metadata.name}</StackItem>
                              <StackItem>
                                <Label color="blue" isCompact>
                                  catalog: {g.metadata.name.replace('uc-', '')}
                                </Label>
                              </StackItem>
                            </Stack>
                          </SplitItem>
                          <SplitItem>
                            <Button
                              variant="plain"
                              aria-label="Delete group"
                              isLoading={deletingGroup === g.metadata.name}
                              onClick={() => handleDeleteGroup(g.metadata.name)}
                            >
                              <TrashIcon />
                            </Button>
                          </SplitItem>
                        </Split>
                      </CardTitle>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>
                            <Flex>
                              <FlexItem>
                                <Content component="small">
                                  {g.users?.length || 0} member{(g.users?.length || 0) !== 1 ? 's' : ''}
                                </Content>
                              </FlexItem>
                              <FlexItem align={{ default: 'alignRight' }}>
                                <Button
                                  variant="link"
                                  size="sm"
                                  onClick={() => {
                                    setManagingGroup(g.metadata.name);
                                  }}
                                >
                                  Manage members
                                </Button>
                              </FlexItem>
                            </Flex>
                          </StackItem>
                          <StackItem>
                            <LabelGroup categoryName="Members">
                              {g.users?.map((u) => (
                                <Label key={u}>{u}</Label>
                              ))}
                            </LabelGroup>
                          </StackItem>
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

      {showCreateGroup ? (
        <Modal isOpen onClose={() => setShowCreateGroup(false)} variant="medium">
          <ModalHeader title="Create Group & Catalog" />
          <ModalBody>
            <Form>
              <FormGroup
                label="Group name"
                isRequired
                fieldId="group-name"
                helperText="A matching catalog will be created automatically. Group will be prefixed with 'uc-'."
              >
                <TextInput
                  id="group-name"
                  value={newGroupName}
                  onChange={(_e, v) => setNewGroupName(v)}
                  isRequired
                />
              </FormGroup>
              <FormGroup label="Members" fieldId="group-users" helperText="Select users from OpenShift">
                <Select
                  id="group-users"
                  isOpen={userSelectOpen}
                  onOpenChange={setUserSelectOpen}
                  selected={selectedUsers}
                  onSelect={handleUserSelect}
                  isScrollable
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setUserSelectOpen(!userSelectOpen)}
                      isExpanded={userSelectOpen}
                      isFullWidth
                    >
                      {selectedUsers.length > 0
                        ? `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`
                        : 'Select users'}
                    </MenuToggle>
                  )}
                >
                  <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {ocpUsers.map((u) => (
                      <SelectOption
                        key={u}
                        value={u}
                        hasCheckbox
                        isSelected={selectedUsers.includes(u)}
                      >
                        {u}
                      </SelectOption>
                    ))}
                    {ocpUsers.length === 0 ? (
                      <SelectOption isDisabled value="none">
                        No users found
                      </SelectOption>
                    ) : null}
                  </SelectList>
                </Select>
                {selectedUsers.length > 0 ? (
                  <LabelGroup categoryName="Selected">
                    {selectedUsers.map((u) => (
                      <Label
                        key={u}
                        onClose={() => setSelectedUsers((prev) => prev.filter((x) => x !== u))}
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

      {managingGroup ? (() => {
        const catalogName = managingGroup.replace('uc-', '');
        const group = groups.find((g) => g.metadata.name === managingGroup);
        const groupMembers = group?.users || [];
        const availableForGroup = ocpUsers.filter((u) => !groupMembers.includes(u));

        const handleAddMemberToGroup = () => {
          setAddingMember(true);
          const endpoint = addMemberRole === 'Catalog Admin'
            ? `${API_PREFIX}/catalogs/${catalogName}/set-admin`
            : `${API_PREFIX}/catalogs/${catalogName}/members`;
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: addMemberEmail }),
          })
            .then(() => {
              setAddMemberEmail('');
              setAddMemberRole('Reader');
              fetchData();
            })
            .catch((e) => setError(e.message))
            .finally(() => setAddingMember(false));
        };

        return (
          <Modal isOpen onClose={() => setManagingGroup(null)} variant="medium">
            <ModalHeader title={`Manage members — ${managingGroup}`} />
            <ModalBody>
              <Stack hasGutter>
                <StackItem>
                  <Content component="h3">Current members</Content>
                </StackItem>
                <StackItem>
                  <LabelGroup categoryName="Members">
                    {groupMembers.map((u) => (
                      <Label key={u}>{u}</Label>
                    ))}
                  </LabelGroup>
                </StackItem>
                <StackItem>
                  <Content component="h3">Add member</Content>
                </StackItem>
                <StackItem>
                  <Form>
                    <Flex>
                      <FlexItem style={{ flex: 2 }}>
                        <FormGroup label="User" fieldId="manage-member-email">
                          <Select
                            id="manage-member-email"
                            isOpen={addMemberSelectOpen}
                            onOpenChange={setAddMemberSelectOpen}
                            selected={addMemberEmail}
                            onSelect={(_e, value) => {
                              setAddMemberEmail(String(value));
                              setAddMemberSelectOpen(false);
                            }}
                            isScrollable
                            toggle={(toggleRef) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() => setAddMemberSelectOpen(!addMemberSelectOpen)}
                                isExpanded={addMemberSelectOpen}
                                isFullWidth
                              >
                                {addMemberEmail || 'Select user'}
                              </MenuToggle>
                            )}
                          >
                            <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
                              {availableForGroup.map((u) => (
                                <SelectOption key={u} value={u}>{u}</SelectOption>
                              ))}
                            </SelectList>
                          </Select>
                        </FormGroup>
                      </FlexItem>
                      <FlexItem style={{ flex: 1 }}>
                        <FormGroup label="Role" fieldId="manage-member-role">
                          <Select
                            id="manage-member-role"
                            isOpen={addMemberRoleOpen}
                            onOpenChange={setAddMemberRoleOpen}
                            selected={addMemberRole}
                            onSelect={(_e, value) => {
                              setAddMemberRole(String(value) as 'Reader' | 'Catalog Admin');
                              setAddMemberRoleOpen(false);
                            }}
                            toggle={(toggleRef) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() => setAddMemberRoleOpen(!addMemberRoleOpen)}
                                isExpanded={addMemberRoleOpen}
                                isFullWidth
                              >
                                {addMemberRole}
                              </MenuToggle>
                            )}
                          >
                            <SelectList>
                              <SelectOption value="Reader">Reader</SelectOption>
                              <SelectOption value="Catalog Admin">Catalog Admin</SelectOption>
                            </SelectList>
                          </Select>
                        </FormGroup>
                      </FlexItem>
                      <FlexItem align={{ default: 'alignSelf-flexEnd' }}>
                        <Button
                          variant="primary"
                          onClick={handleAddMemberToGroup}
                          isDisabled={!addMemberEmail || addingMember}
                          isLoading={addingMember}
                        >
                          Add
                        </Button>
                      </FlexItem>
                    </Flex>
                  </Form>
                </StackItem>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button variant="link" onClick={() => setManagingGroup(null)}>Close</Button>
            </ModalFooter>
          </Modal>
        );
      })() : null}
    </>
  );
};

export default AdminPage;
