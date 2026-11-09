export type Freshness = 'checked' | 'deck';

export interface Stat {
  value: string;
  label: string;
  fresh: Freshness;
}

export interface Guess {
  question: string;
  min: number;
  max: number;
  unit: string;
  answer: number;
  answerLabel: string;
  source: string;
}

export interface Signal {
  id: string;
  n: number;
  act: number | string;
  title: string;
  short: string;
  status: string;
  isNew: boolean;
  icon: string;
  image: string | null;
  art: string | null;
  hook: string;
  why: string;
  story: string;
  stats: Stat[];
  guess: Guess;
  hotTake: string;
  sources: string[];
}

export interface SignalFile {
  placeholder?: boolean;
  signals: Signal[];
}
