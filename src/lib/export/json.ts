import type { MatchEvent, Project } from '../types';
import { downloadText, safeFileName } from './download';

export interface ProjectDump {
  format: 'tartak-analizato-inator';
  version: 1;
  project: Project;
  events: MatchEvent[];
}

export function projectDump(project: Project, events: MatchEvent[]): ProjectDump {
  return { format: 'tartak-analizato-inator', version: 1, project, events };
}

export function downloadProjectJson(project: Project, events: MatchEvent[]): void {
  downloadText(
    JSON.stringify(projectDump(project, events), null, 2),
    `${safeFileName(project.name)}.json`,
    'application/json',
  );
}

export function parseProjectDump(text: string): ProjectDump {
  const data = JSON.parse(text);
  if (data?.format !== 'tartak-analizato-inator' || !data.project || !Array.isArray(data.events)) {
    throw new Error('Not a valid project file');
  }
  return data as ProjectDump;
}
