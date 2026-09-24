export type StoryInstagramPlatform = Readonly<{
  copyText: (value: string) => Promise<void>;
  openInstagram: () => Promise<void>;
}>;

export type StorySharingPoll = Readonly<{
  question: string;
  options: readonly string[];
}>;

export function formatStorySharingPoll(poll: StorySharingPoll): string {
  return `${poll.question} — ${poll.options.join(' / ')}`;
}

export function createStoryInstagramController(platform: StoryInstagramPlatform) {
  return Object.freeze({
    copy(value: string): Promise<void> {
      return platform.copyText(value);
    },
    open(): Promise<void> {
      return platform.openInstagram();
    },
  });
}
