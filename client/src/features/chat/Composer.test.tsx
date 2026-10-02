import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

afterEach(() => vi.useRealTimers());

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the box', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} onTyping={() => {}} />);
    const box = screen.getByLabelText('Message');

    await userEvent.type(box, '  hello there  {Enter}');

    expect(onSend).toHaveBeenCalledWith('hello there');
    expect(box).toHaveValue('');
  });

  it('inserts a newline with Shift+Enter instead of sending', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} onTyping={() => {}} />);

    await userEvent.type(screen.getByLabelText('Message'), 'line 1{Shift>}{Enter}{/Shift}line 2');

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message')).toHaveValue('line 1\nline 2');
  });

  it('does not send blank messages', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} onTyping={() => {}} />);
    await userEvent.type(screen.getByLabelText('Message'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('reports typing once, then stops after a pause', () => {
    vi.useFakeTimers();
    const onTyping = vi.fn<(typing: boolean) => void>();
    render(<Composer onSend={() => {}} onTyping={onTyping} />);
    const box = screen.getByLabelText('Message');

    fireEvent.change(box, { target: { value: 'h' } });
    fireEvent.change(box, { target: { value: 'he' } });
    fireEvent.change(box, { target: { value: 'hey' } });
    expect(onTyping.mock.calls).toEqual([[true]]);

    act(() => vi.advanceTimersByTime(3000));
    expect(onTyping.mock.calls).toEqual([[true], [false]]);
  });

  it('stops typing immediately when the message is sent', () => {
    const onTyping = vi.fn<(typing: boolean) => void>();
    render(<Composer onSend={() => {}} onTyping={onTyping} />);
    const box = screen.getByLabelText('Message');

    fireEvent.change(box, { target: { value: 'hey' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onTyping.mock.calls).toEqual([[true], [false]]);
  });
});
