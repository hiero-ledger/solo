#!/usr/bin/env python3
"""
JDWP Tester - Standalone script for testing JDWP debug connections

This script continuously attempts JDWP handshakes and resume commands
until successful or timeout. It's used to verify that debug port forwarding
is working and can resume suspended JVMs.
"""

import socket
import struct
import sys
import time
import argparse
from pathlib import Path


def recv_exactly(sock: socket.socket, num_bytes: int) -> bytes:
    """Read exactly num_bytes from sock, looping until all bytes are received."""
    data = b""
    while len(data) < num_bytes:
        chunk = sock.recv(num_bytes - len(data))
        if not chunk:
            raise ConnectionError(f"Connection closed after {len(data)}/{num_bytes} bytes")
        data += chunk
    return data


def jdwp_handshake_and_resume(host: str, port: int) -> bool:
    """
    Perform JDWP handshake and send VirtualMachine.Resume command.

    Returns True if successful, False otherwise.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)

        # Connect and handshake
        sock.connect((host, port))
        sock.sendall(b"JDWP-Handshake")
        response = recv_exactly(sock, 14)

        if response != b"JDWP-Handshake":
            print(f"[JDWP] Handshake failed, got: {response!r}", file=sys.stderr)
            return False

        # Send VirtualMachine.Resume command (CommandSet=1, Command=9)
        cmd_set, cmd = 1, 9
        length = struct.pack(">I", 11)
        packet_id = struct.pack(">I", 1)
        flags = b"\x00"
        packet = length + packet_id + flags + bytes([cmd_set, cmd])

        sock.sendall(packet)
        recv_exactly(sock, 11)

        sock.close()
        print("[JDWP] Handshake + Resume successful")
        return True

    except Exception as e:
        print(f"[JDWP] Connection failed: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Test JDWP debug connection")
    parser.add_argument("host", help="Debug host (usually localhost)")
    parser.add_argument("port", type=int, help="Debug port (usually 5005)")
    parser.add_argument("--timeout", type=int, default=300, help="Total timeout in seconds")
    parser.add_argument("--stop-file", default="/tmp/solo-jdwp-stop", help="Stop signal file")

    args = parser.parse_args()

    deadline = time.time() + args.timeout
    success_count = 0

    print(f"[JDWP] Starting probe for {args.host}:{args.port} (timeout: {args.timeout}s)")

    while True:
        # Check for stop signal
        if Path(args.stop_file).exists():
            if success_count > 0:
                print(f"[JDWP] Stop requested after {success_count} successful resume(s)")
                return 0
            else:
                print("[JDWP] Stop requested but no successful resume observed", file=sys.stderr)
                return 1

        # Try JDWP handshake and resume
        if jdwp_handshake_and_resume(args.host, args.port):
            success_count += 1
            print(f"[JDWP] Success count: {success_count}")

        # Check timeout
        if time.time() >= deadline:
            if success_count > 0:
                print(f"[JDWP] Timeout reached with {success_count} successful resume(s)")
                return 0
            else:
                print(f"[JDWP] Timed out after {args.timeout}s without any successful handshake/resume", file=sys.stderr)
                return 1

        time.sleep(2)


if __name__ == "__main__":
    sys.exit(main())
