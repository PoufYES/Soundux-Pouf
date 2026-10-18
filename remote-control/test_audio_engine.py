import array
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
from audio_engine import AudioEngine


class PlaybackTests(unittest.TestCase):
    def test_cached_retrigger_stop_and_gain_keep_device_running(self):
        config = {'settings': {'outputs': ['Test'], 'localVolume': 0},
                  'data': {'tabs': [{'sounds': [{'id': 1, 'path': 'test.wav', 'remoteVolume': 50}]}]}}
        streams = []
        class Device:
            closed = False
            def __init__(self, **kwargs):
                self.options = kwargs
            def start(self, stream):
                streams.append((self, stream))
            def close(self):
                self.closed = True
        with tempfile.TemporaryDirectory() as folder:
            sound = Path(folder) / 'test.wav'
            sound.write_bytes(b'encoded')
            config['data']['tabs'][0]['sounds'][0]['path'] = str(sound)
            engine = AudioEngine()
            with patch.object(engine, 'config', return_value=config), \
                 patch('audio_engine.miniaudio.Devices') as devices, \
                 patch('audio_engine.miniaudio.PlaybackDevice', Device), \
                 patch('audio_engine.miniaudio.decode', return_value=SimpleNamespace(samples=array.array('h', [100, -100] * 20))) as decode, \
                 patch('audio_engine.subprocess.check_output') as powershell:
                devices.return_value.get_playbacks.return_value = [{'name': 'Test', 'id': None}]
                engine.execute({'action': 'play', 'soundId': 1})
                device, stream = streams[0]
                self.assertEqual(list(stream.send(2)), [50, -50] * 2)
                engine.execute({'action': 'play', 'soundId': 1})
                self.assertEqual(list(stream.send(2)), [50, -50] * 2)
                self.assertEqual(len(streams), 1)
                self.assertEqual(device.options['buffersize_msec'], 10)
                decode.assert_called_once()
                powershell.assert_not_called()
                engine.execute({'action': 'stop'})
                self.assertEqual(stream.send(2), b'\0' * 8)
                self.assertFalse(device.closed)
                sound.write_bytes(b'changed audio')
                engine.execute({'action': 'play', 'soundId': 1})
                self.assertEqual(decode.call_count, 2)
                engine.close()
                self.assertTrue(device.closed)


if __name__ == '__main__':
    unittest.main()
