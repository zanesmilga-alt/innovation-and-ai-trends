export type Freshness = 'checked' | 'deck';

export interface Stat {
  value: string;
  label: string;
  fresh: Freshness;
  source?: string;
}

/** "Guess the number" game: the audience-style slider. */
export interface Guess {
  question: string;
  min: number;
  max: number;
  unit: string;
  answer: number;
  answerLabel: string;
  source: string;
}

/** "True or false" game. */
export interface TrueFalse {
  statement: string;
  answer: boolean;
  explanation: string;
}

/** Multiple-choice game: pick one of the options. */
export interface Choice {
  question: string;
  options: string[];
  answer: number; // index into options
  explanation: string;
}

/** "What are the chances" game: a 0–100% slider. */
export interface Chance {
  question: string;
  answer: number;
  explanation: string;
}

export interface Act {
  id: string;
  lens: string;
  title: string;
  sub: string;
}

export type Source = string | { title: string; url?: string };

export interface Signal {
  id: string;
  n: number;
  act: string;
  include?: boolean;
  title: string;
  short: string;
  status: string;
  isNew: boolean;
  icon: string;
  /** Path to the trend picture. Missing file = upload slot is shown. */
  image: string | null;
  art: string | null;
  hook: string;
  why: string;
  story: string;
  stats: Stat[];
  guess?: Guess;
  trueFalse?: TrueFalse;
  chance?: Chance;
  /** The one game for this trend on the phones. */
  gameType?: 'guess' | 'truefalse' | 'choice';
  /** One or two short sentences in small print under the trend. */
  tagline?: string;
  /** Which of the stats the game is about. Hidden in the explorer until the reader plays. */
  gameStat?: number;
  /** Linked sources: the original articles and reports. */
  links?: { title: string; url: string }[];
  /** Optional YouTube link or video ID shown in the details layer. */
  video?: string | null;
  /** Extra detail for each of the three figures, shown when a figure is clicked. */
  more?: string[];
  choice?: Choice;
  hotTake: string;
  sources: Source[];
}

export interface SignalFile {
  placeholder?: boolean;
  signals: Signal[];
  acts: Act[];
  pitch: string;
}
