import socket


def get_ipv4_by_hostname(hostname):
    # see `man getent` `/ hosts `
    # see `man getaddrinfo`

    return list(
        i  # raw socket structure
        [4]  # internet protocol info
        [0]  # address
        for i in
        socket.getaddrinfo(
            hostname,
            0  # port, required
        )
        if i[0] is socket.AddressFamily.AF_INET  # ipv4

        # ignore duplicate addresses with other socket types
        and i[1] is socket.SocketKind.SOCK_DGRAM
    )


if __name__ == "__main__":
    print(get_ipv4_by_hostname('localhost'))
    print(get_ipv4_by_hostname('cogteach.com'))
