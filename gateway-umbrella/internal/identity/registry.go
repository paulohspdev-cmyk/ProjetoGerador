package identity

import(
	"net"
	"strings"
	"sync"
)
type Device struct{ID string `json:"id"`;RemoteCIDRs []string `json:"remoteCidrs,omitempty"`;TLSCommonNames []string `json:"tlsCommonNames,omitempty"`;MQTTClientIDs []string `json:"mqttClientIds,omitempty"`}
type Registry struct{mu sync.RWMutex;devices []Device}
func New(devices []Device)*Registry{cp:=append([]Device(nil),devices...);return &Registry{devices:cp}}
func(r *Registry)MatchRemote(remote string)string{host,_,err:=net.SplitHostPort(remote);if err!=nil{host=remote};ip:=net.ParseIP(host);if ip==nil{return ""};r.mu.RLock();defer r.mu.RUnlock();for _,d:=range r.devices{for _,raw:=range d.RemoteCIDRs{_,n,err:=net.ParseCIDR(strings.TrimSpace(raw));if err==nil&&n.Contains(ip){return d.ID}}};return ""}
