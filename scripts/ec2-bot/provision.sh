#!/bin/bash
# Provision AWS infrastructure for slam-bot EC2 instance
# Run from local machine. Requires AWS CLI with 'jason' profile.
set -euo pipefail

REGION="us-west-2"
AWS="aws --profile jason --region $REGION"
KEY_NAME="slam-bot"
SG_NAME="slam-bot-sg"
AMI="ami-0e5e1413a3bf2d262"  # Ubuntu 24.04 amd64
INSTANCE_TYPE="t3.medium"
VOLUME_SIZE=30

echo "=== Slam Bot EC2 Provisioning ==="

# 1. SSH Key Pair
if $AWS ec2 describe-key-pairs --key-names $KEY_NAME 2>/dev/null; then
  echo "Key pair '$KEY_NAME' already exists"
else
  echo "Creating key pair..."
  $AWS ec2 create-key-pair --key-name $KEY_NAME \
    --query 'KeyMaterial' --output text > ~/.ssh/${KEY_NAME}.pem
  chmod 400 ~/.ssh/${KEY_NAME}.pem
  echo "Key saved to ~/.ssh/${KEY_NAME}.pem"
fi

# 2. Security Group
SG_ID=$($AWS ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  echo "Creating security group..."
  SG_ID=$($AWS ec2 create-security-group --group-name $SG_NAME \
    --description "Slam Bot EC2 - SSH access" --query 'GroupId' --output text)
  $AWS ec2 authorize-security-group-ingress --group-id $SG_ID \
    --protocol tcp --port 22 --cidr 0.0.0.0/0
  echo "Security group created: $SG_ID"
else
  echo "Security group already exists: $SG_ID"
fi

# 3. Launch Instance
EXISTING=$($AWS ec2 describe-instances \
  --filters "Name=tag:Name,Values=slam-bot" "Name=instance-state-name,Values=running,stopped" \
  --query 'Reservations[].Instances[0].InstanceId' --output text 2>/dev/null || echo "None")

if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  echo "Instance already exists: $EXISTING"
  INSTANCE_ID="$EXISTING"
else
  echo "Launching instance..."
  INSTANCE_ID=$($AWS ec2 run-instances \
    --image-id $AMI \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --security-group-ids $SG_ID \
    --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":$VOLUME_SIZE,\"VolumeType\":\"gp3\"}}]" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=slam-bot}]" \
    --count 1 \
    --query 'Instances[0].InstanceId' --output text)
  echo "Instance launched: $INSTANCE_ID"
  echo "Waiting for instance to be running..."
  $AWS ec2 wait instance-running --instance-ids $INSTANCE_ID
fi

# 4. Elastic IP
EIP=$($AWS ec2 describe-addresses --filters "Name=tag:Name,Values=slam-bot" \
  --query 'Addresses[0].PublicIp' --output text 2>/dev/null || echo "None")

if [ "$EIP" = "None" ] || [ -z "$EIP" ]; then
  echo "Allocating Elastic IP..."
  ALLOC_ID=$($AWS ec2 allocate-address --query 'AllocationId' --output text)
  $AWS ec2 create-tags --resources $ALLOC_ID --tags Key=Name,Value=slam-bot
  $AWS ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC_ID
  EIP=$($AWS ec2 describe-addresses --allocation-ids $ALLOC_ID --query 'Addresses[0].PublicIp' --output text)
  echo "Elastic IP: $EIP"
else
  echo "Elastic IP already exists: $EIP"
fi

# 5. SSH config
if ! grep -q "Host slam-bot" ~/.ssh/config 2>/dev/null; then
  echo "" >> ~/.ssh/config
  echo "Host slam-bot" >> ~/.ssh/config
  echo "    HostName $EIP" >> ~/.ssh/config
  echo "    User ubuntu" >> ~/.ssh/config
  echo "    IdentityFile ~/.ssh/${KEY_NAME}.pem" >> ~/.ssh/config
  echo "Added slam-bot to ~/.ssh/config"
fi

echo ""
echo "=== Provisioning complete ==="
echo "Instance: $INSTANCE_ID"
echo "IP: $EIP"
echo "SSH: ssh slam-bot"
echo ""
echo "Next: run 'ssh slam-bot' then run setup.sh on the instance"
