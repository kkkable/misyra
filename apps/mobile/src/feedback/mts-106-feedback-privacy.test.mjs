import { describe, expect, it, vi } from 'vitest';

import {
  createFeedbackSubmissionPayload,
  sanitizeFeedbackTechnicalDetails,
} from './feedback-payload.js';
import { sanitizeFeedbackScreenshot } from './feedback-screenshot.js';

describe('MTS-106 feedback screenshot privacy', () => {
  it('strips source filename and metadata by transcoding a manually selected image', async () => {
    const transcode = vi.fn(async () => ({
      uri: 'file:///feedback/sanitized.png',
      mimeType: 'image/png',
      sizeBytes: 4096,
    }));

    const sanitized = await sanitizeFeedbackScreenshot(
      {
        uri: 'file:///picker/original.jpg',
        mimeType: 'image/jpeg',
        name: 'IMG_1234-location.jpg',
        metadata: {
          GPSLatitude: 22.3193,
          GPSLongitude: 114.1694,
          cameraSerialNumber: 'private-camera-id',
        },
      },
      transcode,
    );

    expect(transcode).toHaveBeenCalledWith('file:///picker/original.jpg');
    expect(sanitized).toEqual({
      uri: 'file:///feedback/sanitized.png',
      mimeType: 'image/png',
      sizeBytes: 4096,
    });
    expect(JSON.stringify(sanitized)).not.toMatch(
      /IMG_1234|GPS|114\.1694|private-camera-id|metadata/i,
    );
  });
});

describe('MTS-106 feedback payload privacy', () => {
  it('keeps only approved technical summary fields and deliberately entered form content', () => {
    const technicalDetails = sanitizeFeedbackTechnicalDetails({
      appVersion: '1.2.3',
      buildVersion: '45',
      deviceModel: 'Test Phone',
      osVersion: 'Test OS 9',
      screenName: 'Settings',
      errorCodes: ['calendar_unavailable'],
      crashIdentifiers: ['crash-123'],
      networkState: 'online',
      submissionTimestamp: '2026-09-28T06:40:00.000Z',
      missionTitle: 'Private mission',
      missionNotes: 'Private note',
      calendarContent: 'Private calendar event',
      aiPlannerInput: 'Private planner prompt',
      evidencePhoto: 'private-evidence.jpg',
      storyContent: 'Private Story',
      token: 'secret-token',
      preciseLocation: '22.3193,114.1694',
      rawLogs: ['private log body'],
      accountEmail: 'provider-email@example.com',
      accountId: 'internal-account-id',
    });

    const payload = createFeedbackSubmissionPayload({
      draft: {
        category: 'problem',
        description: 'The screen did not update.',
        email: '',
        screenshot: {
          uri: 'file:///feedback/sanitized.png',
          mimeType: 'image/png',
          sizeBytes: 4096,
        },
      },
      technicalDetails,
    });

    expect(payload).toMatchInlineSnapshot(`
      {
        "category": "problem",
        "description": "The screen did not update.",
        "email": null,
        "screenshot": {
          "mimeType": "image/png",
          "sizeBytes": 4096,
          "uri": "file:///feedback/sanitized.png",
        },
        "technicalDetails": {
          "appVersion": "1.2.3",
          "buildVersion": "45",
          "crashIdentifiers": [
            "crash-123",
          ],
          "deviceModel": "Test Phone",
          "errorCodes": [
            "calendar_unavailable",
          ],
          "networkState": "online",
          "osVersion": "Test OS 9",
          "screenName": "Settings",
          "submissionTimestamp": "2026-09-28T06:40:00.000Z",
        },
      }
    `);

    expect(JSON.stringify(payload)).not.toMatch(
      /Private mission|Private note|Private calendar|planner prompt|evidence|Private Story|secret-token|22\.3193|rawLogs|provider-email|internal-account/i,
    );
  });
});
