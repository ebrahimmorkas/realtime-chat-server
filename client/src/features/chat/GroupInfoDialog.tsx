import { LogOut, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { errorMessage } from '@/lib/api';
import type { Conversation, User } from '@/lib/types';
import { useAddMembers, useRemoveMember, useRenameGroup } from './api';
import { isFullUser } from './conversation-utils';
import { useLive } from './live-store';
import { PeoplePicker } from './PeoplePicker';

interface Props {
  open: boolean;
  conversation: Conversation;
  meId: string;
  onClose: () => void;
}

export function GroupInfoDialog({ open, conversation, meId, onClose }: Props) {
  const navigate = useNavigate();
  const isAdmin = conversation.members.some((m) => m.user.id === meId && m.role === 'admin');
  const rename = useRenameGroup(conversation.id);
  const addMembers = useAddMembers(conversation.id);
  const removeMember = useRemoveMember(conversation.id);
  const online = useLive((s) => s.online);
  const [name, setName] = useState(conversation.name ?? '');
  const [adding, setAdding] = useState<User[] | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const onError = (err: unknown) => toast.error(errorMessage(err));

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    rename.mutate(name.trim(), { onSuccess: () => toast.success('Group renamed'), onError });
  };

  const leave = () =>
    removeMember.mutate(meId, {
      onSuccess: () => {
        setConfirmLeave(false);
        onClose();
        navigate('/chat');
        toast.success(`You left ${conversation.name ?? 'the group'}`);
      },
      onError,
    });

  return (
    <Modal open={open} title="Group info" onClose={onClose}>
      <div className="space-y-6">
        {isAdmin ? (
          <form onSubmit={submitName} className="flex items-end gap-2">
            <Field label="Group name" className="flex-1">
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={rename.isPending}
              disabled={!name.trim() || name.trim() === conversation.name}
            >
              Save
            </Button>
          </form>
        ) : (
          <p className="text-lg font-semibold">{conversation.name}</p>
        )}

        <section aria-labelledby="members-heading">
          <div className="mb-2 flex items-center justify-between">
            <h3
              id="members-heading"
              className="text-sm font-semibold text-slate-600 dark:text-slate-300"
            >
              {conversation.members.length} members
            </h3>
            {isAdmin && adding === null && (
              <Button size="sm" variant="ghost" onClick={() => setAdding([])}>
                <UserPlus aria-hidden /> Add
              </Button>
            )}
          </div>

          {adding !== null && (
            <div className="mb-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <PeoplePicker
                selected={adding}
                onChange={setAdding}
                excludeIds={conversation.members.map((m) => m.user.id)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAdding(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={adding.length === 0}
                  loading={addMembers.isPending}
                  onClick={() =>
                    addMembers.mutate(
                      adding.map((u) => u.id),
                      { onSuccess: () => setAdding(null), onError },
                    )
                  }
                >
                  Add {adding.length || ''}
                </Button>
              </div>
            </div>
          )}

          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {conversation.members.map((member) => {
              const user = member.user;
              const name = isFullUser(user) ? user.displayName : 'Member';
              const isMe = user.id === meId;
              return (
                <li key={user.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <Avatar
                    name={name}
                    seed={user.id}
                    size="sm"
                    online={!isMe && online.has(user.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {name}
                      {isMe && ' (you)'}
                    </span>
                    {isFullUser(user) && (
                      <span className="block truncate text-xs text-slate-500">
                        @{user.username}
                      </span>
                    )}
                  </span>
                  {member.role === 'admin' && <Badge tone="brand">Admin</Badge>}
                  {isAdmin && !isMe && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${name}`}
                      disabled={removeMember.isPending}
                      onClick={() => removeMember.mutate(user.id, { onError })}
                    >
                      <UserMinus />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <Button
          variant="ghost"
          className="w-full text-red-600"
          onClick={() => setConfirmLeave(true)}
        >
          <LogOut aria-hidden /> Leave group
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this group?"
        description="You will stop receiving its messages. An admin can add you back."
        confirmLabel="Leave group"
        loading={removeMember.isPending}
        onClose={() => setConfirmLeave(false)}
        onConfirm={leave}
      />
    </Modal>
  );
}
