export interface AIDraftModule {
  path: string;
  purpose: string;
}

export interface AIDraft {
  mission: string;
  architectureSummary: string[];
  initialModules: AIDraftModule[];
  apiSurface: string[];
  conventions: string[];
  qualityGates: string[];
  risks: string[];
}
