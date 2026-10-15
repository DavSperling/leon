'use client';

import type { ProjectRow } from '@/server/tasks/projects';
import { Picker, type PickerSlot } from './picker';

type ProjectPickerProps = PickerSlot & {
  projects: readonly ProjectRow[];
  value: string | undefined;
  onChange: (projectId: string) => void;
};

export function ProjectPicker({ projects, value, onChange, ...slot }: ProjectPickerProps) {
  return (
    <Picker
      label="Projet"
      options={projects.map((project) => ({
        value: project.id,
        label: project.name,
        hint: project.key,
        checked: project.id === value,
      }))}
      onSelect={onChange}
      {...slot}
    />
  );
}
