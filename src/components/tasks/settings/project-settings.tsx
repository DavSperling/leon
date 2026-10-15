'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createProjectAction, updateProjectAction } from '@/app/(taches)/taches/reglages/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PROJECT_KEY_MAX_CHARS,
  PROJECT_KEY_PATTERN,
  PROJECT_NAME_MAX_CHARS,
} from '@/lib/tasks/limits';
import { projectKeyFrom } from '@/lib/tasks/ref';
import type { ProjectRow } from '@/server/tasks/projects';
import { CommitInput } from './commit-input';
import { SettingSection } from './setting-section';
import { succeeded } from './succeeded';

const KEY_HINT = `La clé compte de 2 à ${PROJECT_KEY_MAX_CHARS} lettres ou chiffres, sans accent, et commence par une lettre.`;

// Le serveur ne dit que « Saisie invalide » : le champ explique ce qu'il attend.
function validKey(key: string): boolean {
  const valid = PROJECT_KEY_PATTERN.test(key.toUpperCase());
  if (!valid) toast.error(KEY_HINT);
  return valid;
}

function ProjectLine({ project }: { project: ProjectRow }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <CommitInput
        aria-label={`Clé du projet ${project.name}`}
        value={project.key}
        maxLength={PROJECT_KEY_MAX_CHARS}
        autoComplete="off"
        onCommit={async (key) =>
          validKey(key) && (await succeeded(updateProjectAction(project.id, { key })))
        }
        className="w-24 font-mono uppercase"
      />
      <CommitInput
        aria-label={`Nom du projet ${project.key}`}
        value={project.name}
        maxLength={PROJECT_NAME_MAX_CHARS}
        autoComplete="off"
        onCommit={(name) => succeeded(updateProjectAction(project.id, { name }))}
        className="min-w-0 flex-1"
      />
    </li>
  );
}

// Sans clé saisie, celle que le nom donnerait est proposée en filigrane, et c'est elle qui est prise.
function NewProject() {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typedKey = key.trim();
    if (typedKey !== '' && !validKey(typedKey)) return;
    startTransition(async () => {
      const created = await succeeded(
        createProjectAction({ name, key: typedKey === '' ? undefined : typedKey }),
      );
      if (!created) return;
      setName('');
      setKey('');
    });
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2">
      <Input
        aria-label="Clé du nouveau projet"
        value={key}
        placeholder={name.trim() === '' ? 'Clé' : projectKeyFrom(name)}
        maxLength={PROJECT_KEY_MAX_CHARS}
        autoComplete="off"
        onChange={(event) => setKey(event.target.value)}
        className="h-8 w-24 font-mono uppercase"
      />
      <Input
        aria-label="Nom du nouveau projet"
        value={name}
        placeholder="Nouveau projet"
        maxLength={PROJECT_NAME_MAX_CHARS}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        className="h-8 min-w-0 flex-1"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending || name.trim() === ''}>
        <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        Ajouter
      </Button>
    </form>
  );
}

export function ProjectSettings({ projects }: { projects: ProjectRow[] }) {
  return (
    <SettingSection
      id="projets"
      title="Projets"
      description="La clé préfixe les identifiants des tâches (LEO-12). La changer renomme les identifiants de toutes les tâches du projet ; les numéros restent."
    >
      <ul className="divide-y">
        {projects.map((project) => (
          <ProjectLine key={project.id} project={project} />
        ))}
      </ul>
      <NewProject />
    </SettingSection>
  );
}
