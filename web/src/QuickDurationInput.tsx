import { type ClipboardEvent, type KeyboardEvent, useRef } from 'react';
import {
  completeProgressiveDuration,
  progressiveDurationInput,
} from './durationInput';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
};

export function QuickDurationInput({ value, onChange, onComplete }: Props) {
  const typedDigits = useRef('');

  const selectForReplacement = (element: HTMLInputElement) => {
    typedDigits.current = '';
    element.select();
  };

  const updateDigits = (digits: string) => {
    typedDigits.current = digits.replace(/\D/g, '').slice(0, 4);
    onChange(progressiveDurationInput(typedDigits.current));
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const replacing = event.currentTarget.selectionStart === 0
        && event.currentTarget.selectionEnd === event.currentTarget.value.length;
      updateDigits(`${replacing ? '' : typedDigits.current}${event.key}`);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      updateDigits(typedDigits.current.slice(0, -1));
      return;
    }

    if (event.key === ':') event.preventDefault();
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text/plain').replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    updateDigits(digits);
  };

  const complete = () => {
    const completed = completeProgressiveDuration(typedDigits.current, value);
    if (!completed) return;
    typedDigits.current = '';
    onChange(completed);
    onComplete?.(completed);
  };

  return <input
    value={value}
    inputMode="numeric"
    placeholder="08:00"
    required
    onFocus={(event) => selectForReplacement(event.currentTarget)}
    onClick={(event) => selectForReplacement(event.currentTarget)}
    onKeyDown={keyDown}
    onPaste={paste}
    onChange={(event) => onChange(event.target.value)}
    onBlur={complete}
  />;
}
