"""Deterministic fault tests; providers, field commands and real services are never invoked."""
import io
import json
import os
import sys
import tarfile
import tempfile
from pathlib import Path
from unittest.mock import patch

BASE=Path(__file__).resolve().parents[2]
tmp=tempfile.TemporaryDirectory(prefix="rc-recovery-matrix-")
root=Path(tmp.name)
for k,v in {"RC_DATA_DIR":str(root),"RC_DB_FILE":str(root/'test.db'),"RC_RAPID_BINDINGS":str(root/'bindings.json'),"RC_ENVIRONMENT":"development","RC_2FA_ENFORCED":"0","RC_SMTP_HOST":"","RC_WHATSAPP_API_URL":""}.items():os.environ[k]=v
(root/'bindings.json').write_text('[]')
sys.path.insert(0,str(BASE/'backend'))
from app import db,platform_store as store,ops_store,domain_store,industrial_store,transport_store,traffic_store,migrations,notifications,automation_engine,backup_manager
for f in [db.init_db,ops_store.init_ops_db,store.init_platform_db,domain_store.init_domain_db,industrial_store.init_industrial_db,transport_store.init_transport_db,traffic_store.init_traffic_db,automation_engine._init_state]:f()
assert migrations.run_migrations()==5
g=db.create_generator({'tag':'RECOVER','name':'Recovery fixture','site':'Isolated','controller_type':'COMAP','controller_model':'InteliGen 200','transport':'modbus_rtu_serial','host':'/dev/ttyTEST'})
clock={'now':1000000}
store._now=lambda:clock['now']
results=[]
def ok(name,**extra):results.append({'case':name,'status':'aprovado no cenário isolado','details':extra})

a=store.enqueue_lifecycle_operation('op-a',g['id'],'provision',{},'audit','administrador')
b=store.enqueue_lifecycle_operation('op-a',g['id'],'provision',{},'audit','administrador')
assert a['operationId']==b['operationId']
try:store.enqueue_lifecycle_operation('op-a',g['id'],'retire',{},'audit','administrador')
except ValueError:pass
else:raise AssertionError('operationId must bind to same request')
ok('lifecycle_same_operation_id_and_payload_conflict')
try:store.enqueue_lifecycle_operation('op-b',g['id'],'provision',{},'audit','administrador')
except ValueError:pass
else:raise AssertionError('must reject two active operations')
ok('lifecycle_one_active_operation_per_generator')
assert store.claim_lifecycle_operation()['operationId']=='op-a'
clock['now']+=901
assert store.claim_lifecycle_operation() is None
assert store.get_lifecycle_operation('op-a')['status']=='failed'
ok('interrupted_lifecycle_fails_closed_not_automatic_field_retry')

job=store.upsert_scheduler_job({'id':'scheduler-a','name':'Isolated','kind':'audit','interval_seconds':60,'next_run':clock['now']},'audit')
claim=store.claim_scheduler_jobs({'audit'},lease_seconds=60)[0]
assert store.claim_scheduler_jobs({'audit'},lease_seconds=60)==[]
assert store.complete_scheduler_job(job['id'],'late','wrong-token') is False
clock['now']+=61
claim2=store.claim_scheduler_jobs({'audit'},lease_seconds=60)[0]
assert claim2['claim_token']!=claim['claim_token']
assert store.complete_scheduler_job(job['id'],'late',claim['claim_token']) is False
assert store.complete_scheduler_job(job['id'],'OK',claim2['claim_token']) is True
ok('scheduler_claim_exclusivity_expiry_and_fencing')

nid=store.enqueue_notification('audit','panel',subject='isolated',max_attempts=2)
first=store.claim_due_notifications(lease_seconds=30)[0]
assert store.claim_due_notifications(lease_seconds=30)==[]
clock['now']+=31
second=store.claim_due_notifications(lease_seconds=30)[0]
assert first['claim_token']!=second['claim_token']
assert store.finish_notification(nid,'panel','',True,'late',first['claim_token']) is False
assert store.finish_notification(nid,'panel','',False,'simulated failure',second['claim_token']) is True
clock['now']+=31
third=store.claim_due_notifications(lease_seconds=30)[0]
assert store.finish_notification(nid,'panel','',False,'simulated failure',third['claim_token']) is True
with db.connect() as c:state=c.execute('SELECT status,attempts FROM notification_queue WHERE id=?',(nid,)).fetchone()
assert state['status']=='failed' and state['attempts']==2
ok('notification_crash_recovery_fencing_and_bounded_retry')

with patch.object(ops_store,'list_webhooks',return_value=[]):
    delivered,detail=notifications._deliver_webhooks({'id':123,'event_type':'audit'})
assert delivered is True and 'Nenhum webhook' in detail
results.append({'case':'webhook_without_destinations','status':'decisão de contrato pendente','details':{'delivery_function_reports_success':delivered,'detail':detail,'note':'No network request occurred; decide skipped versus delivered, not a confirmed external delivery'}})

for name in ['../../outside','/etc/not-a-real-target']:
    content=io.BytesIO()
    with tarfile.open(fileobj=content,mode='w') as t:
        member=tarfile.TarInfo(name);member.size=1;t.addfile(member,io.BytesIO(b'x'))
    content.seek(0)
    with tarfile.open(fileobj=content,mode='r') as t:
        try:backup_manager._validate_members(t,root/'restore')
        except ValueError:pass
        else:raise AssertionError('path traversal accepted')
ok('backup_rejects_absolute_paths_and_traversal')
content=io.BytesIO()
with tarfile.open(fileobj=content,mode='w') as t:
    member=tarfile.TarInfo('symlink');member.type=tarfile.SYMTYPE;member.linkname='/etc/not-a-real-target';t.addfile(member)
content.seek(0)
with tarfile.open(fileobj=content,mode='r') as t:
    try:backup_manager._validate_members(t,root/'restore')
    except ValueError:pass
    else:raise AssertionError('symlink accepted')
ok('backup_rejects_symlinks')

for action in ['start','stop','gcb_close','mcb_close']:
    try:automation_engine.validate_rule('generator_offline:RECOVER',action+':RECOVER')
    except ValueError:pass
    else:raise AssertionError('industrial automation accepted')
ok('automation_engine_rejects_industrial_writes')
with db.connect() as c:
    integrity=c.execute('PRAGMA integrity_check').fetchone()[0];fk=len(c.execute('PRAGMA foreign_key_check').fetchall())
assert integrity=='ok' and fk==0
ok('schema_migration_and_integrity',schema=5,integrity=integrity,foreign_key_violations=fk)
out={'baseline':'afec24a','external_deliveries':0,'industrial_commands':0,'results':results}
target=BASE/'docs/audit/system-2026-10-14/recovery_results.json'
target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out,ensure_ascii=False,indent=2))
