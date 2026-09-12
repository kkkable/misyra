import { describe, expect, it, vi } from 'vitest';

import { handleMissionNotificationData } from './notification-response-handler.js';

const FIRST_ID = '323e4567-e89b-42d3-a456-426614174001';
const SECOND_ID = '323e4567-e89b-42d3-a456-426614174002';

describe('MTS-064 notification response routing', () => {
  it('routes a single mission notification to Mission Details', () => {
    const navigate = vi.fn();

    expect(
      handleMissionNotificationData(
        { localDate: '2026-09-14', occurrenceIds: [FIRST_ID] },
        navigate,
      ),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith({
      pathname: '/mission/[id]',
      params: { id: FIRST_ID, date: '2026-09-14' },
    });
  });

  it('routes a combined notification to its selected Calendar date with all highlights', () => {
    const navigate = vi.fn();

    expect(
      handleMissionNotificationData(
        { localDate: '2026-09-14', occurrenceIds: [SECOND_ID, FIRST_ID] },
        navigate,
      ),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith({
      pathname: '/',
      params: {
        date: '2026-09-14',
        notificationMissionIds: `${FIRST_ID},${SECOND_ID}`,
      },
    });
  });

  it('does not navigate for malformed notification data', () => {
    const navigate = vi.fn();

    expect(handleMissionNotificationData({ localDate: 'bad', occurrenceIds: [] }, navigate)).toBe(
      false,
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
