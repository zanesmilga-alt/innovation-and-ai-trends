// Trend pictures. A picture uploaded from the stage wins; otherwise the file in public/images/trends is used.

const versions = new Map<string, number>(); // id -> time of the last upload, to refresh images

export function pictureSrc(id: string): string {
  const v = versions.get(id);
  return `/api/picture/${id}${v ? `?v=${v}` : ''}`;
}

/** A picture with an upload slot underneath. The slot shows only when no picture exists. */
export function pictureEl(id: string, cls: string, slotText: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = cls;
  const img = document.createElement('img');
  img.className = 'trend-img duo';
  img.alt = '';
  img.loading = 'lazy';
  img.dataset.pic = id;
  img.src = pictureSrc(id);
  img.onerror = () => {
    if (img.dataset.fallback !== '1') {
      img.dataset.fallback = '1';
      img.src = `/images/trends/${id}.jpg`;
    } else {
      wrap.classList.add('no-img');
    }
  };
  wrap.appendChild(img);
  const slot = document.createElement('span');
  slot.className = 'slot mono';
  slot.textContent = slotText;
  wrap.appendChild(slot);
  return wrap;
}

/** Shows a newly uploaded picture everywhere it is on screen. */
export function markPictureChanged(id: string): void {
  versions.set(id, Date.now());
  document.querySelectorAll<HTMLImageElement>(`img[data-pic="${id}"]`).forEach((img) => {
    img.dataset.fallback = '';
    img.parentElement?.classList.remove('no-img');
    img.src = pictureSrc(id);
  });
}

/** Resizes a photo to a web-sized JPEG and saves it for this trend. */
export async function uploadPicture(id: string, file: File, key: string): Promise<void> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that picture'))), 'image/jpeg', 0.84),
  );
  const res = await fetch(`/api/picture/${id}?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'The presenter key is wrong' : `Upload failed (${res.status})`);
  markPictureChanged(id);
}
