/** 結果の画像（PNG）まわりの、入力から決まる部分 */

/** 画像の論理サイズ（どんな画面でも同じ構図にするため固定） */
export const SHARE_W = 390;
export const SHARE_H = 700;
/** 書き出しの倍率（780×1400 の PNG になる） */
export const SHARE_SCALE = 2;
export const SHARE_FILE_NAME = "mute-the-room.png";
export const SHARE_SAVED_MESSAGE = "画像を保存しました";

export interface ShareData {
  text: string;
  files?: File[];
}

export type ShareCanShare = (data: { files: File[] }) => boolean;

/** 共有に渡すデータを組み立てる。ファイルを共有できる時だけ files を付ける */
export function buildShareData(text: string, file: File | null, canShare: ShareCanShare | undefined): ShareData {
  if (file && canShare) {
    try {
      if (canShare({ files: [file] })) return { text, files: [file] };
    } catch {
      // 判定できない環境では文だけにする
    }
  }
  return { text };
}

/** 画像をどう渡すか：共有／ダウンロード／文だけ */
export type ShareMode = "share-file" | "download" | "text";

export function pickShareMode(hasImage: boolean, data: ShareData): ShareMode {
  if (!hasImage) return "text";
  return data.files && data.files.length > 0 ? "share-file" : "download";
}
