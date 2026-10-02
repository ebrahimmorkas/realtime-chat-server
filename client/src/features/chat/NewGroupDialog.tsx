import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { errorMessage } from '@/lib/api';
import type { User } from '@/lib/types';
import { useCreateGroup } from './api';
import { PeoplePicker } from './PeoplePicker';

export function NewGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const createGroup = useCreateGroup();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<User[]>([]);

  const close = () => {
    setName('');
    setMembers([]);
    createGroup.reset();
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    createGroup.mutate(
      { name: name.trim(), memberIds: members.map((m) => m.id) },
      {
        onSuccess: (conversation) => {
          close();
          navigate(`/chat/${conversation.id}`);
        },
      },
    );
  };

  return (
    <Modal open={open} title="New group" onClose={close}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Group name">
          <Input
            value={name}
            maxLength={80}
            placeholder="e.g. Weekend trip"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Members</p>
          <PeoplePicker selected={members} onChange={setMembers} />
        </div>
        {createGroup.isError && <Alert>{errorMessage(createGroup.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createGroup.isPending}
            disabled={!name.trim() || members.length === 0}
          >
            Create group
          </Button>
        </div>
      </form>
    </Modal>
  );
}
