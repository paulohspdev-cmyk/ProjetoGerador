#!/usr/bin/env python3
"""Regressões puras: somente FC04, framing e interpretação signed/int16."""
import importlib.util
import struct
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name("deif_agc150_probe_readonly.py")
spec = importlib.util.spec_from_file_location("deif_agc150_probe_readonly", SOURCE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class TestDEIFAGC150ReadOnly(unittest.TestCase):
    def test_fc04_read_only_frame(self):
        request = probe.request_frame(3, 507, 123)
        self.assertEqual(request, struct.pack(">HHHBBHH", 123, 0, 6, 3, 4, 507, 1))
        self.assertEqual(request[7], 4)
        self.assertTrue(set([4]) == {request[7]})

    def test_frequency_signed_and_scaling(self):
        pdu = bytes([4, 2, 0x13, 0x88])  # 5000 * 0.01 = 50.00 Hz
        frame = struct.pack(">HHHB", 7, 0, len(pdu) + 1, 1) + pdu
        self.assertEqual(probe.decode_response(frame, 7, 1) * 0.01, 50)

    def test_negative_power_supported(self):
        pdu = bytes([4, 2]) + struct.pack(">h", -12)
        frame = struct.pack(">HHHB", 11, 0, 5, 1) + pdu
        self.assertEqual(probe.decode_response(frame, 11, 1), -12)

    def test_modbus_exception_rejected(self):
        pdu = bytes([0x84, 2])
        frame = struct.pack(">HHHB", 9, 0, 3, 1) + pdu
        with self.assertRaisesRegex(ValueError, "exceção Modbus"):
            probe.decode_response(frame, 9, 1)

    def test_wrong_unit_rejected(self):
        pdu = bytes([4, 2, 0, 1])
        frame = struct.pack(">HHHB", 8, 0, 5, 2) + pdu
        with self.assertRaisesRegex(ValueError, "não corresponde"):
            probe.decode_response(frame, 8, 1)

    def test_no_broadcast_id(self):
        with self.assertRaises(ValueError):
            probe.request_frame(0, 507, 2)


if __name__ == "__main__":
    unittest.main()
