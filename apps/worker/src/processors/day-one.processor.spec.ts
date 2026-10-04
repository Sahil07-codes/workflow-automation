import { assertPublicHostname, isPublicIp, publicLookup } from './day-one.processor';

describe('isPublicIp', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '198.51.100.20',
    '203.0.113.10',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fd00::1',
    '2001:db8::1',
  ])('rejects restricted address %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  describe('assertPublicHostname', () => {
    it('rejects local-only hostnames without resolving them', async () => {
      await expect(assertPublicHostname('localhost')).rejects.toThrow(
        'Local or internal host rejected.',
      );
    });

    it('rejects private literal addresses', async () => {
      await expect(assertPublicHostname('127.0.0.1')).rejects.toThrow(
        'Private or restricted host rejected.',
      );
    });

    it('accepts public literal addresses', async () => {
      await expect(assertPublicHostname('8.8.8.8')).resolves.toBeUndefined();
    });
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicIp(address)).toBe(true);
    },
  );

  it('returns an address array when Node requests all DNS results', (done) => {
    publicLookup('8.8.8.8', { all: true }, (error, result) => {
      expect(error).toBeNull();
      expect(result).toEqual([{ address: '8.8.8.8', family: 4 }]);
      done();
    });
  });

  it('returns a single address when Node requests the default lookup form', (done) => {
    publicLookup('8.8.8.8', {}, (error, address, family) => {
      expect(error).toBeNull();
      expect(address).toBe('8.8.8.8');
      expect(family).toBe(4);
      done();
    });
  });
});
