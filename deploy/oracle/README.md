# Oracle Cloud Always Free deployment

Recommended VM:

- Shape: `VM.Standard.A1.Flex` (Always Free eligible)
- Resources: 2 OCPUs and 12 GB RAM
- Image: Ubuntu 24.04
- Boot volume: 50 GB
- Public IPv4 address: enabled

Paste `cloud-init.yaml` into the instance advanced initialization field when creating the VM.

Allow inbound TCP ports 22, 80, and 443 in the VM subnet security list or network security group.

After the VM is running:

```bash
ssh ubuntu@PUBLIC_IP
git clone https://github.com/vincentlow02/Tokyo-Collectible-Research-Agent.git /opt/curio/repo
cd /opt/curio/repo/deploy/oracle
cp .env.example .env
nano .env
sudo docker compose -f compose.yml up -d --build
```

Check deployment health:

```bash
curl http://127.0.0.1/api/health
sudo docker compose -f compose.yml ps
sudo docker compose -f compose.yml logs --tail=100
```

The public app is initially available at `http://PUBLIC_IP`. Add a domain and HTTPS proxy before sharing it broadly.
