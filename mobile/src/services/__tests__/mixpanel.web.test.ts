type MixpanelBrowserMock = {
  init: jest.Mock;
  track: jest.Mock;
  identify: jest.Mock;
  alias: jest.Mock;
  people: {
    set: jest.Mock;
    set_once: jest.Mock;
  };
  register: jest.Mock;
  reset: jest.Mock;
};

const loadWebMixpanel = () => {
  jest.resetModules();

  const mixpanel: MixpanelBrowserMock = {
    init: jest.fn(),
    track: jest.fn(),
    identify: jest.fn(),
    alias: jest.fn(),
    people: {
      set: jest.fn(),
      set_once: jest.fn(),
    },
    register: jest.fn(),
    reset: jest.fn(),
  };

  jest.doMock('mixpanel-browser', () => ({
    __esModule: true,
    default: mixpanel,
  }));

  process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-token';

  const service = require('../mixpanel.web') as typeof import('../mixpanel.web');
  return { service, mixpanel };
};

describe('mixpanel web service', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
    jest.dontMock('mixpanel-browser');
  });

  it('exports setAnalyticsOptOut and suppresses analytics calls when opted out', async () => {
    const { service, mixpanel } = loadWebMixpanel();

    expect(typeof service.setAnalyticsOptOut).toBe('function');

    await service.initializeMixpanel();
    service.track('Before Opt Out');

    service.setAnalyticsOptOut(true);
    service.track('After Opt Out');
    service.identify('user-1');
    const didAlias = await service.alias('user-1');
    service.setUserProperties({ plan: 'test' });
    service.setUserPropertiesOnce({ first_seen_at: '2026-05-30T00:00:00.000Z' });

    expect(mixpanel.track).toHaveBeenCalledTimes(1);
    expect(mixpanel.track).toHaveBeenCalledWith('Before Opt Out', undefined);
    expect(mixpanel.identify).not.toHaveBeenCalled();
    expect(didAlias).toBe(false);
    expect(mixpanel.alias).not.toHaveBeenCalled();
    expect(mixpanel.people.set).not.toHaveBeenCalled();
    expect(mixpanel.people.set_once).not.toHaveBeenCalled();
  });
});
