```shell
aws backup start-restore-job \
    --recovery-point-arn your-recovery-point-arn \
    --iam-role-arn your-restore-iam-role-arn \
    --metadata '{
        "DBClusterIdentifier": "restored-serverless-v2-cluster",
        "Engine": "aurora-postgresql",  # 或 aurora-mysql
        "EngineVersion": "15.6",       # 确保版本匹配
        "DBSubnetGroupName": "your-db-subnet-group",
        "VpcSecurityGroupIds": "[\"your-security-group-id\"]",
        "MasterUsername": "masteruser",
        "DBClusterParameterGroupName": "your-db-cluster-parameter-group",
        "EngineMode": "provisioned",
        "ServerlessV2ScalingConfiguration": "{\"MinCapacity\":0.5,\"MaxCapacity\":16}"
    }'
```
