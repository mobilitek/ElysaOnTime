import { type CSSProperties, type KeyboardEvent, useRef, useState } from 'react';
import {
  descriptionDocumentText,
  descriptionDocumentExportText,
  newDescriptionLine,
  newDescriptionLineAfter,
  replaceLineWithPastedText,
  type DescriptionLine,
} from './descriptionDocument';

type Props = {
  language: 'fr' | 'en';
  lines: DescriptionLine[];
  legacySource: boolean;
  onChange: (lines: DescriptionLine[]) => void;
};

export function DescriptionOutlineEditor({
  language,
  lines,
  legacySource,
  onChange,
}: Props) {
  const pendingFocus = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fr = language === 'fr';
  const replace = (id: string, values: Partial<DescriptionLine>) =>
    onChange(lines.map((line) => line.id === id ? { ...line, ...values } : line));
  const focusSoon = (id: string) => {
    pendingFocus.current = id;
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-outline-line="${id}"]`)?.focus();
      pendingFocus.current = null;
    });
  };
  const insertAfter = (index: number, depth = lines[index]?.depth ?? 0) => {
    const source = lines[index];
    const line = source
      ? newDescriptionLineAfter({ ...source, depth })
      : newDescriptionLine({ depth });
    onChange([...lines.slice(0, index + 1), line, ...lines.slice(index + 1)]);
    focusSoon(line.id);
  };
  const remove = (index: number) => {
    if (lines.length === 1) {
      onChange([{ ...lines[0]!, text: '', depth: 0, includedInExport: true }]);
      return;
    }
    const next = lines.filter((_, lineIndex) => lineIndex !== index);
    onChange(next);
    focusSoon(next[Math.max(0, index - 1)]!.id);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const line = lines[index]!;
    if (event.key === 'Tab') {
      event.preventDefault();
      replace(line.id, { depth: event.shiftKey ? Math.max(0, line.depth - 1) : line.depth + 1 });
      return;
    }
    if (event.key === 'Enter') {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
        return;
      }
      if (event.shiftKey) return;
      event.preventDefault();
      insertAfter(index, line.depth);
      return;
    }
    if (event.key === 'Backspace' && !line.text && lines.length > 1) {
      event.preventDefault();
      remove(index);
    }
  };
  const addLine = () => {
    const line = newDescriptionLine();
    onChange([...lines, line]);
    focusSoon(line.id);
  };
  const copyAll = async () => {
    const text = descriptionDocumentText(lines);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <section className="outline-editor" aria-label={fr ? 'Description structurée' : 'Structured description'}>
    <div className="outline-editor-heading">
      <div>
        <strong>{fr ? 'Organisation libre' : 'Free-form outline'}</strong>
        <small>{fr ? 'Entrée : nouvel élément · Maj+Entrée : retour interne · ⌘/Ctrl+Entrée : valider · Tab : indenter' : 'Enter: new item · Shift+Enter: line break · ⌘/Ctrl+Enter: save · Tab: indent'}</small>
      </div>
      <div className="outline-heading-actions">
        <button type="button" className="outline-copy" onClick={() => void copyAll()}>
          {copied ? `✓ ${fr ? 'Copié' : 'Copied'}` : `⧉ ${fr ? 'Copier tout' : 'Copy all'}`}
        </button>
        <button type="button" className="outline-add" onClick={addLine}>＋ {fr ? 'Ligne' : 'Line'}</button>
      </div>
    </div>
    {legacySource ? <p className="outline-legacy-note">
      {fr
        ? 'Ancienne description interprétée sans modifier l’original. Les lignes « --- » sont marquées internes comme dans l’export actuel.'
        : 'Legacy description interpreted without changing the original. “---” lines are marked internal as in the current export.'}
    </p> : null}
    <div className="outline-lines">
      {lines.map((line, index) => <div
        className={`outline-line ${line.includedInExport ? '' : 'outline-line-internal'}`}
        key={line.id}
        style={{ '--outline-depth': line.depth } as CSSProperties}
      >
        <button
          type="button"
          className="outline-export-toggle"
          aria-pressed={line.includedInExport}
          title={line.includedInExport
            ? (fr ? 'Incluse dans l’export' : 'Included in export')
            : (fr ? 'Interne — exclue de l’export' : 'Internal — excluded from export')}
          onClick={() => replace(line.id, { includedInExport: !line.includedInExport })}
        >
          <span aria-hidden="true">{line.includedInExport ? '👁' : '🔒'}</span>
          {line.includedInExport ? (fr ? 'Client' : 'Client') : (fr ? 'Interne' : 'Internal')}
        </button>
        <span className="outline-branch" aria-hidden="true">└</span>
        <textarea
          rows={1}
          data-outline-line={line.id}
          value={line.text}
          placeholder={fr ? 'Écrire un élément…' : 'Write an item…'}
          onChange={(event) => replace(line.id, { text: event.target.value })}
          onKeyDown={(event) => keyDown(event, index)}
          onPaste={(event) => {
            const pastedText = event.clipboardData.getData('text/plain');
            if (!/\r?\n/.test(pastedText)) return;
            event.preventDefault();
            const start = event.currentTarget.selectionStart ?? line.text.length;
            const end = event.currentTarget.selectionEnd ?? start;
            const next = replaceLineWithPastedText(
              lines,
              index,
              pastedText,
              line.text.slice(0, start),
              line.text.slice(end),
            );
            onChange(next);
            focusSoon(next[Math.min(next.length - 1, index + pastedText.split(/\r?\n/).filter((value) => value.trim()).length - 1)]!.id);
          }}
        />
        <div className="outline-line-actions">
          <button type="button" title={fr ? 'Désindenter' : 'Outdent'} disabled={line.depth === 0} onClick={() => replace(line.id, { depth: Math.max(0, line.depth - 1) })}>←</button>
          <button type="button" title={fr ? 'Indenter' : 'Indent'} onClick={() => replace(line.id, { depth: line.depth + 1 })}>→</button>
          <button type="button" title={fr ? 'Ajouter après' : 'Add below'} onClick={() => insertAfter(index, line.depth)}>＋</button>
          <button type="button" title={fr ? 'Supprimer la ligne' : 'Delete line'} onClick={() => remove(index)}>×</button>
        </div>
      </div>)}
    </div>
    <details className="outline-export-preview">
      <summary>{fr ? 'Aperçu du texte exporté' : 'Exported text preview'}</summary>
      <pre>{descriptionDocumentExportText(lines) || (fr ? 'Aucune ligne ne sera exportée.' : 'No lines will be exported.')}</pre>
    </details>
  </section>;
}
