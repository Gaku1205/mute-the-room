/** 部屋で鳴る音の種類。bad＝止める音、safe＝押しちゃダメな音 */
export type KindId =
  | "alarm"
  | "phone"
  | "dog"
  | "bell"
  | "kettle"
  | "voice"
  | "buzz"
  | "lullaby"
  | "breath"
  | "rain"
  | "morning";

export interface Kind {
  id: KindId;
  /** 画面に出す擬音 */
  word: string;
  /** 何の音か（小さく添える） */
  source: string;
  /** 文字の色 */
  color: string;
  /** true なら止める音。false なら押しちゃダメ */
  bad: boolean;
}

export const KINDS: Record<KindId, Kind> = {
  alarm: { id: "alarm", word: "ジリリリ", source: "目覚まし", color: "#FF4D3D", bad: true },
  phone: { id: "phone", word: "プルルル", source: "電話", color: "#FFB020", bad: true },
  dog: { id: "dog", word: "ワンワン", source: "となりの犬", color: "#FF7AB6", bad: true },
  bell: { id: "bell", word: "ピンポーン", source: "玄関", color: "#9B8CFF", bad: true },
  kettle: { id: "kettle", word: "ピーーー", source: "やかん", color: "#5CE1E6", bad: true },
  voice: { id: "voice", word: "ねえ起きて", source: "だれか", color: "#FFE14D", bad: true },
  buzz: { id: "buzz", word: "ブーッブーッ", source: "スマホ", color: "#7CF29A", bad: true },
  lullaby: { id: "lullaby", word: "ラ〜ラ〜♪", source: "子守唄", color: "#BFD4FF", bad: false },
  breath: { id: "breath", word: "スー…", source: "寝息", color: "#BFD4FF", bad: false },
  rain: { id: "rain", word: "サァァ…", source: "雨音", color: "#BFD4FF", bad: false },
  morning: { id: "morning", word: "ジリリリ", source: "朝7:00の目覚まし", color: "#FFF3C4", bad: false },
};

export const BAD_KINDS: KindId[] = ["alarm", "phone", "dog", "bell", "kettle", "voice", "buzz"];
export const SAFE_KINDS: KindId[] = ["lullaby", "breath", "rain"];
