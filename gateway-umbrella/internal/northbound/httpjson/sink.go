package httpjson

import(
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
)
type Sink struct{id string;url string;client *http.Client;token string;queue chan core.Record;wg sync.WaitGroup}
func New(id,url string,timeout time.Duration,queue int,bearerTokenEnv string)(*Sink,error){if queue<=0{queue=4096};token:="";if bearerTokenEnv!=""{token=os.Getenv(bearerTokenEnv);if token==""{return nil,fmt.Errorf("northbound %s token env %s is empty",id,bearerTokenEnv)}};return &Sink{id:id,url:url,token:token,client:&http.Client{Timeout:timeout},queue:make(chan core.Record,queue)},nil}
func(s *Sink)Start(ctx context.Context){s.wg.Add(1);go func(){defer s.wg.Done();for{select{case<-ctx.Done():return;case record:=<-s.queue:_=s.post(ctx,record)}}}()}
func(s *Sink)Publish(record core.Record)error{select{case s.queue<-record:return nil;default:return fmt.Errorf("northbound %s queue full",s.id)}}
func(s *Sink)post(ctx context.Context,record core.Record)error{raw,err:=json.Marshal(record);if err!=nil{return err};req,err:=http.NewRequestWithContext(ctx,http.MethodPost,s.url,bytes.NewReader(raw));if err!=nil{return err};req.Header.Set("Content-Type","application/json");if s.token!=""{req.Header.Set("Authorization","Bearer "+s.token)};resp,err:=s.client.Do(req);if err!=nil{return err};defer resp.Body.Close();if resp.StatusCode<200||resp.StatusCode>=300{return fmt.Errorf("northbound %s status %s",s.id,resp.Status)};return nil}
func(s *Sink)Wait(){s.wg.Wait()}
