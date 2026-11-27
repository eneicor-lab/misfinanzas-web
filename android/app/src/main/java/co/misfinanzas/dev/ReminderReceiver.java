package co.misfinanzas.dev;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.*;
import java.util.*;

/** Opaque schedule only: no balances, account names, financial amounts or credentials. */
public final class ReminderReceiver extends BroadcastReceiver {
    private static final String STORE="mf_reminders_private",CHANNEL="mf_reminders",ACTION="co.misfinanzas.dev.REMINDER";
    static void replace(Context context,String value) throws JSONException {
        JSONArray input=new JSONArray(value),safe=new JSONArray();Set<String> ids=new HashSet<>();long now=System.currentTimeMillis();
        if(input.length()>500)throw new JSONException("Schedule too large");
        for(int i=0;i<input.length();i++){
            JSONObject row=input.getJSONObject(i);String id=row.getString("id");long at=row.getLong("at");
            if(!id.matches("[a-f0-9]{64}")||!ids.add(id)||at<=now||at>now+180L*86400000L||row.length()!=2)throw new JSONException("Invalid opaque reminder");
            safe.put(new JSONObject().put("id",id).put("at",at));
        }
        context.getSharedPreferences(STORE,Context.MODE_PRIVATE).edit().putString("pending",safe.toString()).commit();
        schedule(context);
    }
    static void schedule(Context c){
        AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent intent=PendingIntent.getBroadcast(c,0,new Intent(c,ReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(intent);long next=Long.MAX_VALUE;
        try{JSONArray rows=new JSONArray(c.getSharedPreferences(STORE,Context.MODE_PRIVATE).getString("pending","[]"));for(int i=0;i<rows.length();i++)next=Math.min(next,rows.getJSONObject(i).getLong("at"));}catch(JSONException ignored){return;}
        if(next!=Long.MAX_VALUE)alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,Math.max(next,System.currentTimeMillis()+1000),intent);
    }
    @Override public void onReceive(Context c,Intent intent){
        if(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())){schedule(c);return;}
        if(!ACTION.equals(intent.getAction()))return;
        android.content.SharedPreferences prefs=c.getSharedPreferences(STORE,Context.MODE_PRIVATE);
        try{
            JSONArray rows=new JSONArray(prefs.getString("pending","[]")),remaining=new JSONArray();
            Set<String> delivered=new HashSet<>(prefs.getStringSet("delivered",Collections.emptySet()));
            NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Recordatorios de MisFinanzas",NotificationManager.IMPORTANCE_DEFAULT));
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);long at=row.getLong("at");String id=row.getString("id");
                if(at>System.currentTimeMillis()){remaining.put(row);continue;}
                if(delivered.contains(id)||System.currentTimeMillis()-at>86400000L)continue;
                if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)continue;
                PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                Notification notification=new Notification.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setLargeIcon(android.graphics.BitmapFactory.decodeResource(c.getResources(),co.misfinanzas.dev.R.mipmap.ic_launcher))
                    .setContentTitle("MisFinanzas").setContentText("Tienes un recordatorio pendiente. Abre tu aplicacion para revisarlo.")
                    .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true).setTimeoutAfter(30L*86400000L).build();
                manager.notify(id.hashCode(),notification);delivered.add(id);
            }
            if(delivered.size()>1000)delivered=new HashSet<>();
            prefs.edit().putString("pending",remaining.toString()).putStringSet("delivered",delivered).commit();schedule(c);
        }catch(JSONException ignored){/* Fail closed on corrupt private schedule. */}
    }
}
