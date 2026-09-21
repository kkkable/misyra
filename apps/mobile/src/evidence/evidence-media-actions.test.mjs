import { describe, expect, it, vi } from 'vitest';

import { createEvidenceMediaActions } from './evidence-media-actions.js';

function harness(permission = 'granted') {
  const api = {
    downloadOriginal: vi.fn(() => Promise.resolve('file:///private/tmp/evidence-save.jpg')),
    deleteMedia: vi.fn(() => Promise.resolve()),
  };
  const photoLibrary = {
    requestSavePermission: vi.fn(() => Promise.resolve(permission)),
    saveToPhotos: vi.fn(() => Promise.resolve()),
  };
  const files = {
    discard: vi.fn(() => Promise.resolve()),
    deleteAttemptCopies: vi.fn(() => Promise.resolve()),
  };
  const actions = createEvidenceMediaActions({ api, photoLibrary, files });
  return { actions, api, photoLibrary, files };
}

describe('MTS-084 evidence media actions', () => {
  it('requests photo-save permission only when the user explicitly invokes Save to Photos', async () => {
    const { actions, api, photoLibrary, files } = harness();

    expect(photoLibrary.requestSavePermission).not.toHaveBeenCalled();
    expect(photoLibrary.saveToPhotos).not.toHaveBeenCalled();
    expect(api.downloadOriginal).not.toHaveBeenCalled();

    await expect(actions.saveToPhotos('attempt-a')).resolves.toEqual({ saved: true });

    expect(photoLibrary.requestSavePermission).toHaveBeenCalledTimes(1);
    expect(api.downloadOriginal).toHaveBeenCalledWith('attempt-a');
    expect(photoLibrary.saveToPhotos).toHaveBeenCalledWith('file:///private/tmp/evidence-save.jpg');
    expect(files.discard).toHaveBeenCalledWith('file:///private/tmp/evidence-save.jpg');
  });

  it('does not download or write anything when photo-save permission is denied', async () => {
    const { actions, api, photoLibrary, files } = harness('denied');

    await expect(actions.saveToPhotos('attempt-a')).resolves.toEqual({ saved: false });

    expect(photoLibrary.requestSavePermission).toHaveBeenCalledTimes(1);
    expect(api.downloadOriginal).not.toHaveBeenCalled();
    expect(photoLibrary.saveToPhotos).not.toHaveBeenCalled();
    expect(files.discard).not.toHaveBeenCalled();
  });

  it('cleans local attempt copies before requesting irreversible server deletion', async () => {
    const { actions, api, files } = harness();
    api.deleteMedia.mockRejectedValueOnce(new Error('fixture server delete unavailable'));

    await expect(actions.deleteEvidence('attempt-a')).rejects.toThrow(
      'fixture server delete unavailable',
    );

    expect(files.deleteAttemptCopies).toHaveBeenCalledWith('attempt-a');
    expect(files.deleteAttemptCopies.mock.invocationCallOrder[0]).toBeLessThan(
      api.deleteMedia.mock.invocationCallOrder[0],
    );
  });

  it('deletes app-controlled local/server copies without touching the saved phone copy', async () => {
    const { actions, api, photoLibrary, files } = harness();

    await actions.saveToPhotos('attempt-a');
    photoLibrary.requestSavePermission.mockClear();
    photoLibrary.saveToPhotos.mockClear();

    await expect(actions.deleteEvidence('attempt-a')).resolves.toBeUndefined();

    expect(api.deleteMedia).toHaveBeenCalledWith('attempt-a');
    expect(files.deleteAttemptCopies).toHaveBeenCalledWith('attempt-a');
    expect(photoLibrary.requestSavePermission).not.toHaveBeenCalled();
    expect(photoLibrary.saveToPhotos).not.toHaveBeenCalled();
  });
});
